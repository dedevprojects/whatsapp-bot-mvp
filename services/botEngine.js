'use strict';

/**
 * Bot Engine
 *
 * Bridges incoming WhatsApp messages with the Supabase business configuration
 * and the message handler. This is the central orchestrator.
 */

const supabase = require('../config/supabase');
const { handleMessage } = require('../bot/messageHandler');
const { generateTTS } = require('./tts');
const logger = require('../utils/logger');

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

    // Return in chronological order
    return data.reverse().map(m => ({
        role: m.direction,
        text: m.message_text
    }));
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

    // 1. Log inbound message (fire and forget)
    if (!fromMe) {
        // Log "media" if text is missing but media is present
        const logText = text || (mediaBuffer ? `[Media: ${mimeType}]` : "");
        logMessage(business.id, senderJid, logText, 'inbound');
    }

    // 2. Get recent history to provide context
    const history = await getRecentHistory(business.id, senderJid);

    // 3. Handle message with context
    const replies = await handleMessage({ senderJid, text, business, fromMe, history, mediaBuffer, mimeType });

    for (const reply of replies) {
        // Send the text reply first
        await sendReply(senderJid, reply);
        logger.info({ senderJid, business: business.business_name }, 'Reply sent');
        
        // --- TTS Voice Reply (Zero Cost) ---
        // If TTS is enabled for the business, also send the audio
        if (business.tts_enabled) {
            try {
                const voice = business.tts_voice || 'es-MX-JorgeNeural';
                const audioBuffer = await generateTTS(reply, voice);
                
                if (audioBuffer) {
                    await sendReply(senderJid, audioBuffer, { mimetype: 'audio/mpeg' }); // MP3 format
                    logger.info({ senderJid, business: business.business_name }, 'TTS Reply sent');
                }
            } catch (err) {
                logger.error({ err }, 'Failed to send TTS reply');
            }
        }
        
        // Log outbound message (fire and forget)
        logMessage(business.id, senderJid, reply, 'outbound');
    }
}

module.exports = { processMessage, invalidateCache };
