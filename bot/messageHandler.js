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
const logger = require('../utils/logger');

// In-memory session store: jid -> { welcomed: boolean }
const sessions = new Map();

const UNKNOWN_RESPONSE = 'Por favor elegí una opción del menú. 📋';

/**
 * Processes a single incoming message and returns the reply text(s).
 *
 * @param {string} senderJid  - WhatsApp JID of the sender
 * @param {string} text       - Normalized message text
 * @param {object} business   - Row from the `businesses` table
 * @returns {string[]}        - Array of messages to send in sequence
 */
function handleMessage(senderJid, text, business) {
    const normalizedText = (text || '').trim().toLowerCase();

    const session = sessions.get(senderJid) || { welcomed: false };

    // ─── First contact or greeting keywords ───────────────────────────────────
    const isGreeting =
        !session.welcomed ||
        ['hola', 'hi', 'hello', 'ola', 'buenas', 'inicio', 'start', 'menu', 'menú'].includes(
            normalizedText
        );

    if (isGreeting) {
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

    // ─── Silent Fallback ──────────────────────────────────────────────────────
    // After the initial greeting, if nothing matches, the bot stays silent
    // so the human can take over the conversation without interference.
    logger.debug({ senderJid, text: normalizedText }, 'No match — staying silent');
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
