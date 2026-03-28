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
async function processMessage({ senderJid, recipientJid, text, mediaBuffer = null, mimeType = null, sendReply, fromMe = false }) {
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

    // 3. (ADDITIVE) Check and Inject Appointment Availability & Rules
    const augmentedBusiness = { ...business };
    if (business.booking_enabled) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const slotsToday = await getAvailableSlots(business, today);
            
            augmentedBusiness.knowledge_base = (business.knowledge_base || "") + 
                `\n--- REGLAS DE AGENDA (FORMATO 24 HS) ---\n` +
                `- Horario: ${business.shift_start} a ${business.shift_end}. Turnos cada ${business.slot_duration} min.\n` +
                `- LIBRES HOY (${today}): ${slotsToday.join(', ') || 'Todo ocupado hoy'}.\n` +
                `- REGLA: Puedes ofrecer turnos para cualquier fecha futura. Atendemos Lunes a Viernes.\n` +
                `- FORMATO DE CONFIRMACIÓN: Si confirmas un turno, usa EXACTAMENTE: '¡Genial! Turno agendado para el AAAA-MM-DD a las HH:MM.'`;
            
            logger.info({ business: business.business_name }, 'Enhanced availability context injected');
        } catch (err) {
            logger.error({ err }, 'Failed to inject availability context');
        }
    }

    // 4. Handle message with context (Using augmented business for AI, but logging remains stable)
    const replies = await handleMessage({ senderJid, text, business: augmentedBusiness, fromMe, history, mediaBuffer, mimeType });

    for (const reply of replies) {
        // (ADDITIVE) Booking Detection Logic (Capturing Date and Time)
        if (reply.includes('Turno agendado para el')) {
            const combinedMatch = reply.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
            if (combinedMatch) {
                const bookedDate = combinedMatch[1];
                const bookedTime = combinedMatch[2];
                const isoDateTime = `${bookedDate}T${bookedTime}:00Z`;
                
                try {
                    await bookAppointment({
                        businessId: business.id,
                        contactName: 'Usuario WhatsApp', 
                        contactNumber: senderJid.split('@')[0],
                        isoDateTime
                    });
                    logger.info({ business: business.business_name, time: isoDateTime }, 'AI triggered multi-date booking');
                } catch (err) {
                    logger.error({ err }, 'Booking failed to save to DB');
                }
            }
        }
        // Send the text reply first
        await sendReply(senderJid, reply);
        logger.info({ senderJid, business: business.business_name }, 'Reply sent');
        // --- AI Response Sent (Text only) ---
        
        // Log outbound message (fire and forget)
        logMessage(business.id, senderJid, reply, 'outbound');
    }
}

module.exports = { processMessage, invalidateCache };
