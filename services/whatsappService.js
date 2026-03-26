'use strict';

const path = require('path');
const fs = require('fs');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    isJidGroup,
    Browsers,
    useMultiFileAuthState
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
    const sessionPath = path.join(SESSIONS_DIR, whatsappNumber.replace(/[^a-zA-Z0-9]/g, ''));
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    // const { state, saveCreds } = await useSupabaseAuthState(whatsappNumber); // DISABLED TO FIX CONNECTION TIMEOUT 

    
    let version;
    try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
    } catch (err) {
        logger.warn({ err }, 'Failed to fetch latest Baileys version, using default');
        version = [2, 3000, 1015901307]; // Fallback
    }

    logger.info({ businessName, whatsappNumber, version }, 'Starting Baileys socket');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ component: 'baileys', business: businessName }),
        // USE MAC OS DISGUISE TO PREVENT WHATSAPP REJECTING THE QR CODE
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        getMessage: async () => ({ conversation: '' }),
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
                { businessName, whatsappNumber, statusCode, error: lastDisconnect?.error?.message },
                'WhatsApp connection closed'
            );

            if (shouldReconnect) {
                const delay = 5000;
                logger.info({ businessName, whatsappNumber, delay }, 'Reconnecting…');
                setTimeout(() => connectBusiness(whatsappNumber, businessName), delay);
            } else {
                logger.error({ businessName, whatsappNumber }, 'Logged out — session cleared');
                connections.delete(whatsappNumber);
            }
        }
    });

    // ─── Incoming messages ───────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                const remoteJid = msg.key.remoteJid || '';
                if (isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) continue;

                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
                    msg.message?.listResponseMessage?.title ||
                    '';

                // Only process if text exists or is from us (human intervention detection)
                if (!text && !msg.key.fromMe) continue;

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
 */
async function sendMessage(sock, jid, text) {
    if (!sock) throw new Error('No socket available');
    await sock.sendMessage(jid, { text });
}

/**
 * Disconnects a business's WhatsApp session gracefully.
 */
async function disconnectBusiness(whatsappNumber) {
    const sock = connections.get(whatsappNumber);
    if (sock) {
        try {
            await sock.logout();
            sock.ws.close();
        } catch (e) {}
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
 */
function getQRCode(whatsappNumber) {
    return qrCodes.get(whatsappNumber) || null;
}

module.exports = { connectBusiness, disconnectBusiness, getStatus, getQRCode };
