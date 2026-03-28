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
async function getRecentHistory(businessId, senderJid, limit = 20) {
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

    // 1. --- HUMAN INTERVENTION DETECTION (FROM ME) ---
    // If the message is from the bot/human phone, update the silence session and stop.
    if (fromMe) {
        logger.debug({ senderJid }, 'Human/Bot interaction from phone detected. Updating session.');
        await handleMessage({ senderJid, text, business, fromMe: true, history: [] });
        return;
    }

    // 2. --- LOAD RECENT HISTORY ---
    // We load history BEFORE logging the current message to keep them separate for AI context.
    const history = await getRecentHistory(business.id, senderJid);

    // 3. --- LOG INBOUND MESSAGE ---
    const logText = text || (mediaBuffer ? `[Media: ${mimeType}]` : "");
    await logMessage(business.id, senderJid, logText, 'inbound');

    // -------------------------------------------------------------------------
    // --- DETERMINISTIC FILTER (INSTANT RESPONSES) ---
    // -------------------------------------------------------------------------
    const rawText = (text || '').toLowerCase().trim();
    const cleanNumberText = (text || '').replace(/[^0-9]/g, '').trim(); 
    
    const greetings = ['hola', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'buenas', 'hola!', 'hola.', 'inicio', 'menu', 'menú'];
    
    // isFirstContact if history was empty.
    const isFirstContact = history.length === 0;
    const matchesGreeting = greetings.includes(rawText);
    const isGreeting = isFirstContact || matchesGreeting;

    const fixedMenu = `1. Servicios 🛠️\n2. Precios 💰\n3. Agendar Turno 🗓️`;

    // A. Handle Greetings/Initial Contact
    if (isGreeting && !mediaBuffer) {
        // Build the menu based on MUST HAVE options AND business options
        const finalGreeting = `${business.welcome_message || '¡Hola! ¿En qué puedo ayudarte?'}\n\n${fixedMenu}`;
        await sendReply(senderJid, finalGreeting);
        await logMessage(business.id, senderJid, finalGreeting, 'outbound');
        return;
    }

    // B. Handle Numeric Options (優先順位: Business Responses > Fixed Logic)
    // We check if the business has a response for this number.
    if (business.responses && business.responses[cleanNumberText]) {
        const responseText = business.responses[cleanNumberText];
        await sendReply(senderJid, responseText);
        await logMessage(business.id, senderJid, responseText, 'outbound');
        return;
    }

    // Fallback fixed logic for 1, 2, 3 if business doesn't have them
    if (cleanNumberText === "1") {
        const servicesText = `🛠️ *Nuestros Servicios:*\n\n${business.description || 'Consulta con nosotros para más detalles.'}\n\n${fixedMenu}`;
        await sendReply(senderJid, servicesText);
        await logMessage(business.id, senderJid, servicesText, 'outbound');
        return;
    }
    if (cleanNumberText === "2") {
        const pricesText = `💰 *Nuestros Precios:*\n\n${business.knowledge_base || 'Consulta precios específicos con un asesor.'}\n\n${fixedMenu}`;
        await sendReply(senderJid, pricesText);
        await logMessage(business.id, senderJid, pricesText, 'outbound');
        return;
    }
    if (cleanNumberText === "3") {
        const now = new Date();
        const todayISO = now.toISOString().split('T')[0];
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayName = dayNames[now.getDay()];
        let workingDaysLabels = 'Lunes a Sábado';
        try {
            const workingDaysRaw = business.working_days || '1,2,3,4,5,6';
            const workingDaysArr = typeof workingDaysRaw === 'string' ? workingDaysRaw.split(',') : (Array.isArray(workingDaysRaw) ? workingDaysRaw : []);
            if (workingDaysArr.length > 0) workingDaysLabels = workingDaysArr.map(d => dayNames[parseInt(d)] || 'día hábil').join(', ');
        } catch(e){}

        const turnsText = `🗓️ *Agenda de Turnos:*\n\nAtendemos: ${workingDaysLabels}\nHorario: ${business.shift_start} a ${business.shift_end}\n\n*Para reservar, simplemente escribe el día y la hora que prefieres.* (Ej: El Miércoles a las 11:00)`;
        await sendReply(senderJid, turnsText);
        await logMessage(business.id, senderJid, turnsText, 'outbound');
        return;
    }

    // --- GEMINI AI FALLBACK ---
    const augmentedBusiness = { ...business };
    if (business.booking_enabled) {
        try {
            const now = new Date();
            const todayISO = now.toISOString().split('T')[0];
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const dayName = dayNames[now.getDay()];
            
            let workingDaysLabels = 'Lunes a Sábado';
            const workingDaysRaw = business.working_days || '1,2,3,4,5,6';
            const workingDaysArr = typeof workingDaysRaw === 'string' ? workingDaysRaw.split(',') : (Array.isArray(workingDaysRaw) ? workingDaysRaw : []);
            if (workingDaysArr.length > 0) {
                workingDaysLabels = workingDaysArr.map(d => dayNames[parseInt(d)] || 'día hábil').join(', ');
            }

            // Get available slots
            let slotsToday = [];
            try {
                const slotsPromise = getAvailableSlots(business, todayISO);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
                slotsToday = await Promise.race([slotsPromise, timeoutPromise]);
            } catch (slotsErr) {
                logger.warn({ business: business.business_name }, 'Slots check timed out (Non-blocking)');
            }
            
            const menuRules = `\n--- REGLAS CRÍTICAS DE RESPUESTA ---\n` +
                `- SIEMPRE QUE TE SALUDEN O ESTÉS EN DUDA, PRESENTA ESTE MENÚ: 1. Servicios 🛠️, 2. Precios 💰, 3. Turnos/Reservas 🗓️.\n` +
                `- DÍAS DE ATENCIÓN: ${workingDaysLabels}.\n` +
                `- HORARIOS: ${business.shift_start} a ${business.shift_end}.\n` +
                `- HOY ES: ${dayName} ${todayISO}.\n` +
                `- LIBRES HOY (${todayISO}): ${slotsToday.length > 0 ? slotsToday.join(', ') : 'Consultar disponibilidad'}.\n` +
                `- REGLA DE RESERVA: Si el usuario menciona un día (como Miércoles) o fecha y una hora, DEBES AGENDARLO. No pidas confirmación extra si ya tienes día y hora.\n` +
                `- FORMATO DE CONFIRMACIÓN OBLIGATORIO: Para confirmar el turno, DEBES incluir exactamente esta frase: '¡Genial! Turno agendado para el AAAA-MM-DD a las HH:MM.' (reemplazando con la fecha y hora calculada).\n`;

            // Mix in the business responses so Gemini knows about specific option contents (prices, etc)
            let extraBusinessContext = "";
            if (business.responses) {
                try {
                    const parsedResponses = typeof business.responses === 'string' ? JSON.parse(business.responses) : business.responses;
                    extraBusinessContext = "\n--- RESPUESTAS CONFIGURADAS ---\n" + 
                        Object.entries(parsedResponses).map(([k, v]) => `Opción ${k}: ${v}`).join('\n') + "\n";
                } catch (e) {
                    extraBusinessContext = "\n--- RESPUESTAS CONFIGURADAS ---\n" + business.responses + "\n";
                }
            }

            augmentedBusiness.knowledge_base = menuRules + extraBusinessContext + (business.knowledge_base || "");
        } catch (err) {
            logger.error({ err }, 'Failed to inject availability context (Non-blocking)');
        }
    }

    // 4. Handle message (Using augmented business, stable AI call)
    let replies = [];
    try {
        replies = await handleMessage({ senderJid, senderName, text, business: augmentedBusiness, fromMe: false, history, mediaBuffer, mimeType });
    } catch (err) {
        logger.error({ err }, 'AI handleMessage failed');
        replies = ['Disculpa, estoy teniendo un problema técnico momentáneo. ¿Podrías repetirme tu consulta?'];
    }

    for (const reply of replies) {
        await sendReply(senderJid, reply);
        
        // Save booking if detected
        if (reply.includes('Turno agendado para el')) {
            const combinedMatch = reply.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
            if (combinedMatch) {
                const bookedDate = combinedMatch[1];
                const bookedTime = combinedMatch[2];
                const isoDateTime = `${bookedDate}T${bookedTime}:00Z`;
                
                try {
                    const cleanClientNumber = senderJid.replace(/[^0-9]/g, '');
                    await bookAppointment({
                        businessId: business.id,
                        contactName: senderName || 'Usuario WhatsApp', 
                        contactNumber: cleanClientNumber,
                        isoDateTime
                    });
                    logger.info({ business: business.business_name, time: isoDateTime }, 'AI confirmed booking saved to DB');
                } catch (err) {
                    logger.error({ err }, 'Background booking failed to save (non-blocking)');
                }
            }
        }
        
        await logMessage(business.id, senderJid, reply, 'outbound');
    }
}

module.exports = { processMessage, invalidateCache };
