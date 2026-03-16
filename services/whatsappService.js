'use strict';

/**
 * WhatsApp Service
 *
 * Manages one or more Baileys socket connections.
 * Each business that connects its WhatsApp number gets its own socket,
 * stored in the `connections` Map, keyed by whatsapp_number.
 *
 * Session data (auth state + credentials) is persisted to disk under
 * ./sessions/<whatsapp_number>/ so connections survive server restarts.
 */

const path = require('path');
const fs = require('fs');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    isJidGroup,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { processMessage } = require('./botEngine');
const logger = require('../utils/logger');
const { useSupabaseAuthState } = require('../utils/supabaseAuth');

// Map<whatsapp_number, WASocket>
const connections = new Map();

// Map<whatsapp_number, string> - Stores the latest QR code string for unauthenticated sessions
const qrCodes = new Map();

const SESSIONS_DIR = path.resolve(process.cwd(), 'sessions');

/** Ensure the sessions root directory exists */
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Creates and starts a WhatsApp socket for a given business.
 *
 * @param {string} whatsappNumber - E.164 number, e.g. "+5491112345678"
 * @param {string} [businessName] - Human-readable label for logs
 */
async function connectBusiness(whatsappNumber, businessName = 'Unknown') {
    const { state, saveCreds } = await useSupabaseAuthState(whatsappNumber);
    const { version } = await fetchLatestBaileysVersion();

    logger.info({ businessName, whatsappNumber, version }, 'Starting Baileys socket');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,     // we print manually to control formatting
        logger: logger.child({ component: 'baileys', business: businessName }),
        browser: ['Bot Universal', 'Chrome', '120.0'],
        syncFullHistory: false,
        getMessage: async () => ({ conversation: '' }), // minimal history
    });

    connections.set(whatsappNumber, sock);

    // ─── Credentials update ──────────────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ─── Connection state changes ────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodes.set(whatsappNumber, qr);
            logger.info({ businessName, whatsappNumber }, 'QR code ready — scan to connect');
            console.log(`\n📲  Scan QR for [${businessName}] (${whatsappNumber}):\n`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            qrCodes.delete(whatsappNumber);
            logger.info({ businessName, whatsappNumber }, '✅ WhatsApp connected successfully');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(
                { businessName, whatsappNumber, statusCode, shouldReconnect },
                'WhatsApp connection closed'
            );

            if (shouldReconnect) {
                const delay = 5000; // 5 s back-off before retry
                logger.info({ businessName, whatsappNumber, delay }, 'Reconnecting…');
                setTimeout(() => connectBusiness(whatsappNumber, businessName), delay);
            } else {
                logger.error({ businessName, whatsappNumber }, 'Logged out — delete session to re-link');
                connections.delete(whatsappNumber);
            }
        }
    });

    // ─── Incoming messages ───────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                // Skip broadcast / group messages
                const remoteJid = msg.key.remoteJid || '';
                if (isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) continue;

                // Extract plain text (handles text, extended text, and button replies)
                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
                    msg.message?.listResponseMessage?.title ||
                    '';

                if (!text && !msg.key.fromMe) continue;

                // The bot's own JID tells us which number received the message
                const recipientJid = sock.user?.id || '';

                await processMessage({
                    senderJid: remoteJid,
                    recipientJid,
                    text: text || '',
                    sendReply: (jid, replyText) => sendMessage(sock, jid, replyText),
                    fromMe: !!msg.key.fromMe
                });
            } catch (err) {
                logger.error({ err, msgId: msg.key.id }, 'Error processing message');
            }
        }
    });

    return sock;
}

/**
 * Sends a plain-text message via a given socket.
 * @param {WASocket} sock
 * @param {string} jid
 * @param {string} text
 */
async function sendMessage(sock, jid, text) {
    await sock.sendMessage(jid, { text });
}

/**
 * Disconnects a business's WhatsApp session gracefully.
 * @param {string} whatsappNumber
 */
async function disconnectBusiness(whatsappNumber) {
    const sock = connections.get(whatsappNumber);
    if (sock) {
        await sock.logout();
        connections.delete(whatsappNumber);
        logger.info({ whatsappNumber }, 'WhatsApp disconnected');
    }
}

/**
 * Returns connection status info for all connected businesses.
 */
function getStatus() {
    const status = {};
    for (const [number, sock] of connections.entries()) {
        status[number] = {
            connected: sock.user != null,
            user: sock.user?.id || null,
        };
    }
    return status;
}

/**
 * Gets the current QR code for a given number.
 * @param {string} whatsappNumber
 * @returns {string|null}
 */
function getQRCode(whatsappNumber) {
    return qrCodes.get(whatsappNumber) || null;
}

module.exports = { connectBusiness, disconnectBusiness, getStatus, getQRCode };
