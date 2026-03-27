'use strict';

/**
 * Message Handler
 *
 * Decides what to reply based on:
 *  - Whether this is the user's first interaction (session tracking)
 *  - The content of the user's message
 *
 * Conversation state is stored in-memory per sender JID.
 * A simple Map is enough for the MVP; it can be replaced with Redis later.
 */

const { buildMenu } = require('./menuBuilder');
const { getChatResponse } = require('../services/gemini');
const logger = require('../utils/logger');

// In-memory session store: jid -> { welcomed: boolean, lastHumanInteraction: number }
const sessions = new Map();

// Silence period after human interaction (2 hours)
const HUMAN_SILENCE_MS = 2 * 60 * 60 * 1000;

const UNKNOWN_RESPONSE = 'Por favor elegí una opción del menú.';

/**
 * Processes a single incoming message and returns the reply text(s).
 *
 * @param {string} senderJid  - WhatsApp JID of the sender
 * @param {string} text       - Normalized message text
 * @param {object} business   - Row from the `businesses` table
 * @returns {Promise<string[]>}        - Array of messages to send in sequence
 */
async function handleMessage({ senderJid, text, business, fromMe = false, history = [], audioBuffer = null, mimeType = null }) {
    const session = sessions.get(senderJid) || { welcomed: false, lastHumanInteraction: 0 };

    // ─── Human Intervention Detection ─────────────────────────────────────────
    if (fromMe) {
        logger.debug({ senderJid }, 'Human interaction detected, silting bot for this user');
        sessions.set(senderJid, { ...session, lastHumanInteraction: Date.now() });
        return [];
    }

    // Check if we are in the "Silence Period" (human took over)
    const isSilenced = (Date.now() - session.lastHumanInteraction) < HUMAN_SILENCE_MS;
    if (isSilenced) {
        logger.debug({ senderJid }, 'Bot is silenced because of recent human interaction');
        return [];
    }

    const normalizedText = (text || '').trim().toLowerCase();

    // ─── First contact or greeting keywords ───────────────────────────────────
    const isGreeting =
        !session.welcomed ||
        ['hola', 'hi', 'hello', 'ola', 'buenas', 'inicio', 'start', 'menu', 'menú'].includes(
            normalizedText
        );

    // If it's a greeting and NOT an audio, show the menu
    if (isGreeting && !audioBuffer) {
        sessions.set(senderJid, { welcomed: true });

        const menuText = buildMenu(business.menu_options);
        const welcomePart = business.welcome_message || '¡Bienvenido!';
        const menuHeader = '\n\n*¿En qué te puedo ayudar?*\n';

        logger.debug({ senderJid, business: business.business_name }, 'Sending welcome + menu');
        return [`${welcomePart}${menuHeader}\n${menuText}`];
    }

    // ─── Numeric option ────────────────────────────────────────────────────────
    if (business.responses && business.responses[normalizedText]) {
        logger.debug({ senderJid, option: normalizedText }, 'Matched menu option');
        return [business.responses[normalizedText]];
    }

    // ─── Gemini AI Fallback (Handles Text AND Audio) ──────────────────────────
    logger.debug({ senderJid, hasAudio: !!audioBuffer }, 'Calling Gemini AI');
    
    // Pass history and audio to AI for contextual responses
    const aiResponse = await getChatResponse({ text, business, history, audioBuffer, mimeType });
    
    if (aiResponse) {
        // Mark as welcomed if the AI successfully handled a voice/text request
        if (!session.welcomed) sessions.set(senderJid, { welcomed: true });
        return [aiResponse];
    }

    return [];
}

/**
 * Clears the session for a given JID (useful when a chat is closed).
 * @param {string} jid
 */
function clearSession(jid) {
    sessions.delete(jid);
}

module.exports = { handleMessage, clearSession };
