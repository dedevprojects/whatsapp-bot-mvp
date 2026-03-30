'use strict';

/**
 * Bot Engine
 *
 * Bridges incoming WhatsApp messages with the Supabase business configuration
 * and the message handler. This is the central orchestrator.
 */

const supabase = require('../config/supabase');
const { handleMessage } = require('../bot/messageHandler');
const { buildMenu } = require('../bot/menuBuilder');
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
async function processMessage({ senderJid, senderName, recipientJid, text, mediaBuffer = null, mimeType = null, sendReply, fromMe = false, messageId = "" }) {
    // Convert Baileys JID (e.g. "5491112345678:1@s.whatsapp.net") to E.164
    const rawNumber = recipientJid.split(':')[0].split('@')[0];
    const whatsappNumber = `+${rawNumber}`;

    const business = await getBusinessConfig(whatsappNumber);
    if (!business) {
        logger.warn({ whatsappNumber }, 'Ignoring message — business not configured');
        return;
    }

    // 1. --- HUMAN INTERVENTION DETECTION (FROM ME) ---
    if (fromMe) {
        // Robust echo filter: If the message originates from our bot API (usually starting with BAE5, 3EB0, or long strings), SKIP silencing the session.
        // Human messages sent from the phone/web usually have shorter/distinct IDs (like 3A... in newer versions).
        const isBotEcho = messageId.startsWith('BAE5') || messageId.startsWith('3EB0') || messageId.length > 21;
        if (isBotEcho) {
            logger.debug({ senderJid, messageId }, 'Ignoring bot echo message identified by ID.');
            return;
        }

        logger.debug({ senderJid, messageId }, 'Human interaction from physical phone detected. Silencing bot.');
        await handleMessage({ senderJid, text, business, fromMe: true, history: [] });
        return;
    }

    // 2. --- LOAD RECENT HISTORY ---
    // We load history BEFORE logging the current message to keep them separate for AI context.
    const history = await getRecentHistory(business.id, senderJid);
    
    // NEW: Get upcoming appointment for context
    const cleanSenderNum = senderJid.replace(/[^0-9]/g, '');
    const upcomingAppt = await require('./appointmentService').getUpcomingAppointment(business.id, cleanSenderNum);

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

    let dynamicMenu = buildMenu(business.menu_options);
    
    // Check if we should use a default menu (only if totally empty or has less than 2 real options)
    const menuKeys = Object.keys(business.menu_options || {});
    const hasEnoughOptions = menuKeys.length >= 2;
    const isSinOpciones = dynamicMenu.includes('Sin opciones') || dynamicMenu.includes('(Sin opciones');
    
    // If no menu options are set, provide the standard default
    if (!business.menu_options || !hasEnoughOptions || isSinOpciones) {
        dynamicMenu = `1️⃣ Servicios 🛠️\n2️⃣ Precios 💰\n3️⃣ Agendar Turno 🗓️`;
    }

    // Append Turno instruction ONLY if booking is enabled and NOT already visible as an option
    if (business.booking_enabled && !dynamicMenu.toLowerCase().includes('turno') && !dynamicMenu.toLowerCase().includes('reserva')) {
        dynamicMenu += `\n\n🗓️ Para agendar un turno, escribe "Turno".`;
    }

    // Identify which labels map to which actions (Servicios, Precios, Turnos)
    const menuMap = {}; // number -> type
    if (business.menu_options) {
        Object.entries(business.menu_options).forEach(([key, label]) => {
            const lowLabel = label.toLowerCase();
            if (lowLabel.includes('servicio')) menuMap[key] = 'servicios';
            else if (lowLabel.includes('precio') || lowLabel.includes('costo') || lowLabel.includes('valor')) menuMap[key] = 'precios';
            else if (lowLabel.includes('turno') || lowLabel.includes('reserva') || lowLabel.includes('agendar')) menuMap[key] = 'turnos';
        });
    }

    // Manual overrides for the default menu if it's being used
    if (!hasEnoughOptions || isSinOpciones) {
        menuMap["1"] = 'servicios';
        menuMap["2"] = 'precios';
        menuMap["3"] = 'turnos';
    }

    // A. Handle Greetings/Initial Contact
    // Only intercept if it's JUST a greeting. If it has more content, let AI handle it.
    const isJustGreeting = greetings.includes(rawText);
    
    // NEW: Automatic Lead Capture on first contact
    if (isFirstContact) {
        try {
            const cleanSenderNum = senderJid.replace(/[^0-9]/g, '');
            const contactName = senderName || 'Usuario WhatsApp';
            
            // 1. Save to DB leads table
            const { data: newLead } = await supabase.from('leads').insert([{
                business_name: business.business_name,
                contact_name: contactName,
                contact_number: cleanSenderNum,
                interest_level: 'Medium'
            }]).select().single();

            // 2. Trigger Webhook
            if (business.webhook_url) {
                const { sendWebhook } = require('../utils/webhookHelper');
                sendWebhook(business.webhook_url, {
                    event: 'whatsapp_new_lead',
                    contact_name: contactName,
                    contact_number: cleanSenderNum,
                    business_name: business.business_name
                }).catch(e => logger.error('Error on whatsapp webhook send'));
            }
        } catch (err) {
            logger.error({ err }, 'Failed to auto-capture WhatsApp lead');
        }
    }

    if ((isFirstContact || isJustGreeting) && !mediaBuffer) {
        // Build the menu based on MUST HAVE options AND business options
        const finalGreeting = `${business.welcome_message || '¡Hola! ¿En qué puedo ayudarte?'}\n\n${dynamicMenu}`;
        await sendReply(senderJid, finalGreeting);
        await logMessage(business.id, senderJid, finalGreeting, 'outbound');
        return;
    }

    // B. Handle Numeric Options (優先順位: Logic > Dashboard JSON Responses)
    // Identify logical action based on keywords or numbered menu position
    const actionType = menuMap[rawText] || (rawText === "servicios" || rawText === "servicio" ? 'servicios' : (rawText === "precios" || rawText === "precio" || rawText === "costo" || rawText === "valor" ? 'precios' : (rawText === "turno" || rawText === "turnos" ? 'turnos' : null)));

    // Check if the business has a SPECIFIC response for this key in the Dashboard
    const isExactNumber = /^[0-9]+$/.test(rawText);
    const dashboardResponse = (isExactNumber && business.responses) ? business.responses[rawText] : null;

    if (dashboardResponse) {
        const finalResponse = `${dashboardResponse}\n\n${dynamicMenu}`;
        await sendReply(senderJid, finalResponse);
        await logMessage(business.id, senderJid, finalResponse, 'outbound');
        return;
    }

    // If no specific dashboard response, fallback to action-based data
    if (actionType === 'servicios') {
        const hasSpecificServices = business.responses && business.responses.services_text;
        const textToUse = hasSpecificServices ? business.responses.services_text : (business.description || 'Consulta con nosotros para más detalles.');
        
        const servicesText = `${textToUse}\n\n🤖 *Si tienes alguna otra duda o quieres saber más sobre este servicio, ¡Escríbemela! Estoy aquí para ayudarte.*\n\nO si prefieres ir al menú principal:\n${dynamicMenu}`;
        await sendReply(senderJid, servicesText);
        await logMessage(business.id, senderJid, servicesText, 'outbound');
        return;
    }
    
    if (actionType === 'precios') {
        const pricesText = `${business.knowledge_base || 'Consulta precios específicos con un asesor.'}\n\n🤖 *Si tienes alguna consulta puntual sobre un precio o promoción especial, pregúntame con confianza.*\n\nO elige otra opción:\n${dynamicMenu}`;
        await sendReply(senderJid, pricesText);
        await logMessage(business.id, senderJid, pricesText, 'outbound');
        return;
    }
    
    if (actionType === 'turnos') {
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

        const cleanShiftStart = (business.shift_start || '09:00:00').slice(0, 5);
        const cleanShiftEnd = (business.shift_end || '18:00:00').slice(0, 5);

        const turnsText = `Atendemos: ${workingDaysLabels}\nHorarios: ${cleanShiftStart} a ${cleanShiftEnd}\n\n*Para reservar, escribe el día y la hora de tu preferencia.* (Ej: El Miércoles a las ${cleanShiftStart})\n\n${dynamicMenu}`;
        await sendReply(senderJid, turnsText);
        await logMessage(business.id, senderJid, turnsText, 'outbound');
        return;
    }

    // If no specific action, check for exact JSON responses (legacy/generic numbers)
    if (isExactNumber && business.responses && business.responses[rawText]) {
        const responseText = business.responses[rawText];
        await sendReply(senderJid, responseText);
        await logMessage(business.id, senderJid, responseText, 'outbound');
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
            
            const cleanShiftStartAI = (business.shift_start || '09:00:00').slice(0, 5);
            const cleanShiftEndAI = (business.shift_end || '18:00:00').slice(0, 5);

            const menuRules = `\n--- REGLAS CRÍTICAS DE RESPUESTA ---\n` +
                `- SIEMPRE QUE TE SALUDEN O ESTÉS EN DUDA, PRESENTA ESTE MENÚ:\n${dynamicMenu}\n` +
                `- DÍAS DE ATENCIÓN: ${workingDaysLabels}.\n` +
                `- HORARIOS: ${cleanShiftStartAI} a ${cleanShiftEndAI}. Los turnos duran ${business.slot_duration || 30} mins, por lo que NO hay horarios intermedios caprichosos (ej: si empieza a las 9 y dura 45m, los turnos son 09:00, 09:45, 10:30, etc).\n` +
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

            // Inject upcoming appointment if exists
            if (upcomingAppt) {
                const date = new Date(upcomingAppt.appointment_time).toLocaleDateString();
                const time = new Date(upcomingAppt.appointment_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                augmentedBusiness.knowledge_base += `\n--- TURNO ACTUAL DEL CLIENTE ---\nEl cliente ya tiene un turno agendado para el ${date} a las ${time}hs. Si desea CANCELARLO, confirma con la frase exacta: 'Turno cancelado correctamente.'\n`;
            }
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
                try {
                    // Extract exactly the phone number digits and ensure it's clean
                    const cleanClientNumber = senderJid.replace(/[^0-9]/g, '');
                    const localBookingTime = `${bookedDate}T${bookedTime}:00`; 

                    await bookAppointment({
                        businessId: business.id,
                        contactName: senderName || 'Usuario WhatsApp', 
                        contactNumber: cleanClientNumber,
                        isoDateTime: localBookingTime // Store as local floating time (DB assumes UTC if TZ is missing)
                    });
                    logger.info({ business: business.business_name, time: localBookingTime }, 'AI confirmed booking saved to DB');
                } catch (err) {
                    logger.error({ err }, 'Background booking failed to save (non-blocking)');
                }
            }
        }
        
        await logMessage(business.id, senderJid, reply, 'outbound');

        // NEW: Detect Cancellation phrase
        if (reply.includes('Turno cancelado correctamente.')) {
            try {
                const cleanNum = senderJid.replace(/[^0-9]/g, '');
                await require('./appointmentService').cancelAppointment(business.id, cleanNum);
                logger.info({ business: business.business_name, num: cleanNum }, 'AI triggered cancellation saved to DB');
            } catch (err) {
                logger.error({ err }, 'Background cancellation failed (non-blocking)');
            }
        }
    }
}

module.exports = { processMessage, invalidateCache };
