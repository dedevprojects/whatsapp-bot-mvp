'use strict';

/**
 * Bot Engine
 *
 * Bridges incoming WhatsApp messages with the Supabase business configuration
 * and the message handler. This is the central orchestrator.
 */

const supabase = require('../config/supabase');
const { handleMessage } = require('../bot/messageHandler');
const logger = require('../utils/logger');
const { getAvailableSlots, bookAppointment } = require('./appointmentService');

/**
 * Logs a message to Supabase.
 */
async function logMessage(businessId, senderJid, text, direction) {
    const { error } = await supabase
        .from('messages')
        .insert([{
            business_id: businessId,
            sender_jid: senderJid,
            message_text: text,
            direction
        }]);

    if (error) {
        logger.error({ error, businessId, senderJid }, 'Failed to log message to Supabase');
    }
}

/**
 * Retrieves the last N messages for a conversation.
 */
async function getRecentHistory(businessId, senderJid, limit = 6) {
    const { data, error } = await supabase
        .from('messages')
        .select('message_text, direction')
        .eq('business_id', businessId)
        .eq('sender_jid', senderJid)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        logger.error({ error, senderJid }, 'Error loading history from Supabase');
        return [];
    }

    const history = data.reverse().map(m => ({
        role: m.direction,
        text: m.message_text
    }));

    logger.info({ senderJid, messageCount: history.length }, 'History loaded from Supabase');
    return history;
}

// Simple LRU-like in-process cache to avoid hammering Supabase on every message.
// Key: normalized whatsapp_number | Value: { data: business, fetchedAt: Date }
const businessCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches business config from Supabase, using an in-memory cache.
 * @param {string} whatsappNumber - E.164 format, e.g. "+5491112345678"
 * @returns {Promise<object|null>}
 */
async function getBusinessConfig(whatsappNumber) {
    const cached = businessCache.get(whatsappNumber);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }

    const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('whatsapp_number', whatsappNumber)
        .eq('active', true)          // only serve active businesses
        .maybeSingle();

    if (error) {
        logger.error({ error, whatsappNumber }, 'Error fetching business config from Supabase');
        return null;
    }

    if (!data) {
        logger.warn({ whatsappNumber }, 'No active business found for this number');
        return null;
    }

    businessCache.set(whatsappNumber, { data, fetchedAt: Date.now() });
    logger.info({ businessName: data.business_name, whatsappNumber }, 'Business config loaded');
    return data;
}

/**
 * Invalidates the cache for a given number (e.g., after a config update).
 * @param {string} whatsappNumber
 */
function invalidateCache(whatsappNumber) {
    businessCache.delete(whatsappNumber);
    logger.debug({ whatsappNumber }, 'Business cache invalidated');
}

/**
 * Main entry point called by whatsappService for each incoming message.
 *
 * @param {object} params
 * @param {string} params.senderJid      - WhatsApp JID of the person who sent the message
 * @param {string} params.recipientJid   - The bot's own JID (identifies which business to use)
 * @param {string} params.text           - Plain text content of the message
 * @param {Function} params.sendReply    - Async function(jid, text) provided by whatsappService
 * @param {boolean} params.fromMe        - True if the message was sent FROM the bot itself
 */
async function processMessage({ senderJid, senderName, recipientJid, text, mediaBuffer = null, mimeType = null, sendReply, fromMe = false }) {
    // Convert Baileys JID (e.g. "5491112345678:1@s.whatsapp.net") to E.164
    const rawNumber = recipientJid.split(':')[0].split('@')[0];
    const whatsappNumber = `+${rawNumber}`;

    const business = await getBusinessConfig(whatsappNumber);
    if (!business) {
        logger.warn({ whatsappNumber }, 'Ignoring message — business not configured');
        return;
    }

    // 1. Get recent history to provide context (BEFORE logging current message to avoid duplication in AI call)
    const history = await getRecentHistory(business.id, senderJid);

    // 2. Log inbound message (fire and forget)
    if (!fromMe) {
        // Log "media" if text is missing but media is present
        const logText = text || (mediaBuffer ? `[Media: ${mimeType}]` : "");
        await logMessage(business.id, senderJid, logText, 'inbound');
    }

    // 2. (ADDITIVE) GREETING DETECTOR & DETERMINISTIC MENU
    const greetings = ['hola', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'buenas', 'hola!', 'hola.', 'inicio', 'menu', 'menú'];
    const isGreeting = greetings.includes(text.toLowerCase().trim());
    
    if (isGreeting) {
        let menuStr = '';
        if (business.menu_options) {
             Object.entries(business.menu_options).forEach(([k, v]) => {
                 menuStr += `${k}. ${v}\n`;
             });
        }
        // Add Booking option automatically if enabled but not in menu
        if (business.booking_enabled && !menuStr.includes('Turno')) {
            menuStr += `${Object.keys(business.menu_options || {}).length + 1}. Agendar Turno 🗓️\n`;
        }

        const finalGreeting = `${business.welcome_message || '¡Hola! ¿En qué puedo ayudarte?'}\n\n${menuStr.trim()}`;
        await sendReply(senderJid, finalGreeting);
        logMessage(business.id, senderJid, finalGreeting, 'outbound');
        return; // EXIT EARLY - NO AI NEEDED FOR GREETING
    }

    // 3. (ADDITIVE) Check and Inject Appointment Availability & Rules
    const augmentedBusiness = { ...business };
    if (business.booking_enabled) {
        try {
            const now = new Date();
            const todayISO = now.toISOString().split('T')[0];
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const dayName = dayNames[now.getDay()];
            
            // Map working_days string to actual names safely
            let workingDaysLabels = 'Lunes a Sábado';
            const workingDaysRaw = business.working_days || '1,2,3,4,5,6';
            const workingDaysArr = typeof workingDaysRaw === 'string' ? workingDaysRaw.split(',') : (Array.isArray(workingDaysRaw) ? workingDaysRaw : []);
            if (workingDaysArr.length > 0) {
                workingDaysLabels = workingDaysArr.map(d => dayNames[parseInt(d)] || 'día hábil').join(', ');
            }

            // Get available slots with a FAST TIMEOUT (max 2 seconds)
            let slotsToday = [];
            try {
                const slotsPromise = getAvailableSlots(business, todayISO);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
                slotsToday = await Promise.race([slotsPromise, timeoutPromise]);
            } catch (slotsErr) {
                logger.warn({ business: business.business_name }, 'Slots check timed out or failed (Proceeding without slots)');
            }
            
            const menuRules = `\n--- REGLAS CRÍTICAS DE RESPUESTA (PRIORIDAD ALTA) ---\n` +
                `- SI EL USUARIO TE SALUDA, PRESENTA SIEMPRE ESTE MENÚ COMPLETO: 1. Servicios 🛠️, 2. Precios 💰, 3. Turnos/Reservas 🗓️.\n` +
                `- DÍAS DE ATENCIÓN: ${workingDaysLabels}.\n` +
                `- HORARIOS: ${business.shift_start} a ${business.shift_end} (Turnos cada ${business.slot_duration} min).\n` +
                `- HOY ES: ${dayName} ${todayISO}.\n` +
                `- LIBRES HOY (${todayISO}): ${slotsToday.length > 0 ? slotsToday.join(', ') : 'Consultar disponibilidad'}.\n` +
                `- SI PREGUNTAN POR TURNOS/RESERVAS: Infórmales tus DÍAS y HORARIOS y pregúntales qué día desean agendar.\n` +
                `- REGLA FINAL: Para agendar, responde SIEMPRE: '¡Genial! Turno agendado para el AAAA-MM-DD a las HH:MM.'\n` +
                `--------------------------------------------\n`;

            augmentedBusiness.knowledge_base = menuRules + (business.knowledge_base || "");
            
            logger.info({ business: business.business_name, dayName }, 'Menu rules prepended for high priority');
        } catch (err) {
            logger.error({ err }, 'Failed to inject availability context (Non-blocking)');
        }
    }

    // 4. Handle message (Using augmented business, stable AI call)
    let replies = [];
    try {
        replies = await handleMessage({ senderJid, text, business: augmentedBusiness, fromMe, history, mediaBuffer, mimeType });
    } catch (err) {
        logger.error({ err }, 'AI handleMessage failed');
        replies = ['Disculpa, estoy teniendo un problema técnico momentáneo. ¿Podrías repetirme tu consulta?'];
    }

    for (const reply of replies) {
        // --- 1. ALWAYS SEND THE REPLY TO WHATSAPP FIRST (Stability Priority) ---
        await sendReply(senderJid, reply);
        
        // --- 2. (ADDITIVE) If booking detected, store in DB silently ---
        if (reply.includes('Turno agendado para el')) {
            const combinedMatch = reply.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
            if (combinedMatch) {
                const bookedDate = combinedMatch[1];
                const bookedTime = combinedMatch[2];
                const isoDateTime = `${bookedDate}T${bookedTime}:00Z`;
                
                try {
                    // Filter out non-numeric chars
                    const cleanClientNumber = senderJid.replace(/[^0-9]/g, '');
                    
                    // PREVENT SELF-BOOKING (If the number is the same as the business WhatsApp)
                    if (cleanClientNumber === business.whatsapp_number.replace(/[^0-9]/g, '')) {
                        logger.info('Skipping self-booking/internal chat');
                    } else {
                        await bookAppointment({
                            businessId: business.id,
                            contactName: senderName || 'Usuario WhatsApp', 
                            contactNumber: cleanClientNumber,
                            isoDateTime
                        });
                        logger.info({ business: business.business_name, time: isoDateTime }, 'AI confirmed booking saved to DB');
                    }
                } catch (err) {
                    logger.error({ err }, 'Background booking failed to save (non-blocking)');
                }
            }
        }
        
        // Log log
        logMessage(business.id, senderJid, reply, 'outbound');
    }
}

module.exports = { processMessage, invalidateCache };
