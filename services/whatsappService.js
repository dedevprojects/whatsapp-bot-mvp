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
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { processMessage } = require('./botEngine');
const logger = require('../utils/logger');
const { useSupabaseAuthState } = require('../utils/supabaseAuth');
const supabase = require('../config/supabase');


// Track processed message IDs to avoid double-processing (especially with notify-type duplicates)
const processedMessages = new Set();
const MAX_PROCESSED_LOG = 1000;

// Map<whatsapp_number, WASocket>
const connections = new Map();

// Map<whatsapp_number, string> - Stores the latest QR code string for unauthenticated sessions
const qrCodes = new Map();

// No local sessions directory needed; we use Supabase for persistent auth


/**
 * Creates and starts a WhatsApp socket for a given business.
 *
 * @param {string} whatsappNumber - E.164 number, e.g. "+5491112345678"
 * @param {string} [businessName] - Human-readable label for logs
 */
async function connectBusiness(whatsappNumber, businessName = 'Unknown') {
    if (connections.has(whatsappNumber)) {
        logger.info({ whatsappNumber }, 'Business already connected, skipping duplicate connection attempt');
        return connections.get(whatsappNumber);
    }

    // Using Supabase instead of local files for persistence
    const { state, saveCreds } = await useSupabaseAuthState(whatsappNumber);

    
    let version;
    try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
    } catch (err) {
        logger.warn({ err }, 'Failed to fetch latest Baileys version, using default');
        version = [2, 3000, 1015901307]; // Fallback
    }

    logger.info({ businessName, whatsappNumber, version }, 'Starting Baileys socket');
    console.log(`[SYS] Basando conexión para ${businessName} (${whatsappNumber})`);

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
            logger.info({ businessName, whatsappNumber }, 'QR code generated and stored');
            console.log(`\n📲 [OK] QR LISTO para [${businessName}] (${whatsappNumber}):\n`);
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
            
            // Delete old connection so map is clean for reconnections
            connections.delete(whatsappNumber);

            if (shouldReconnect) {
                const delay = 5000;
                logger.info({ businessName, whatsappNumber, delay }, 'Reconnecting…');
                setTimeout(() => connectBusiness(whatsappNumber, businessName), delay);
            } else {
                logger.error({ businessName, whatsappNumber }, 'Logged out — session cleared');
                
                // Clear state from Supabase
                await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', whatsappNumber);
            }
        }
    });

    // ─── Incoming messages ───────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                const messageId = msg.key.id;
                if (processedMessages.has(messageId)) continue;
                processedMessages.add(messageId);
                
                // Cleanup to prevent memory leak
                if (processedMessages.size > MAX_PROCESSED_LOG) {
                    const first = processedMessages.values().next().value;
                    processedMessages.delete(first);
                }

                const remoteJid = msg.key.remoteJid || '';
                if (isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) continue;

                // Skip processing of messages sent by the bot's own API (echo events)
                const isBaileysAPI = messageId.startsWith('BAE5') || messageId.startsWith('3EB0') || messageId.length > 21;
                if (msg.key.fromMe && isBaileysAPI) continue;

                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
                    msg.message?.listResponseMessage?.title ||
                    '';
                
                const imageMsg = msg.message?.imageMessage;
                const documentMsg = msg.message?.documentMessage || msg.message?.documentWithCaptionMessage?.message?.documentMessage;
                
                let mediaData = null;
                let mimeType = null;
                
                if (imageMsg || documentMsg) {
                    try {
                        const type = imageMsg ? 'image' : 'document';
                        logger.info({ msgId: msg.key.id, type }, `Descargando ${type} para procesar...`);
                        
                        mediaData = await downloadMediaMessage(
                            msg,
                            'buffer',
                            {},
                            { 
                                logger,
                                reuploadRequest: sock.updateMediaMessage 
                            }
                        );
                        mimeType = imageMsg?.mimetype || documentMsg?.mimetype;
                        logger.debug({ size: mediaData?.length, mimeType }, 'Media descargado con éxito');
                    } catch (err) {
                        logger.error({ err, msgId: msg.key.id }, 'Error al descargar media');
                    }
                }

                // If it's a caption in an image/document, use it as text
                const finalContextText = text || imageMsg?.caption || documentMsg?.caption || '';

                // Only process if it has text, media, or is from us (human intervention detection)
                if (!finalContextText && !mediaData && !msg.key.fromMe) continue;

                const recipientJid = sock.user?.id || '';

                await processMessage({
                    senderJid: remoteJid,
                    senderName: msg.pushName || 'Usuario WhatsApp',
                    recipientJid,
                    text: finalContextText,
                    mediaBuffer: mediaData,
                    mimeType: mimeType,
                    sendReply: (jid, content, options) => sendMessage(sock, jid, content, options),
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
 * Sends a text message via a given socket.
 */
async function sendMessage(sock, jid, content, options = {}) {
    if (!sock) throw new Error('No socket available');
    
    // Send as text
    await sock.sendMessage(jid, { text: content });
}

/**
 * Disconnects a business's WhatsApp session gracefully.
 */
async function disconnectBusiness(whatsappNumber) {
    const sock = connections.get(whatsappNumber);
    if (sock) {
        try {
            // Attempt graceful close, but don't hang if it's already dead
            sock.end(new Error('Manual reset requested'));
        } catch (e) {}
        connections.delete(whatsappNumber);
        qrCodes.delete(whatsappNumber);
        logger.info({ whatsappNumber }, 'WhatsApp memory cleared for manual reset');
    }
    
    // THE RESET: Explicitly clear from Supabase so it starts fresh next time
    try {
        const { error } = await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', whatsappNumber);
        if (error) throw error;
        logger.info({ whatsappNumber }, 'Session data cleared from Supabase');
    } catch (err) {
        logger.error({ err, whatsappNumber }, 'Failed to clear session from DB during disconnect');
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
