'use strict';

/**
 * server.js — Application Entry Point
 *
 * Responsibilities:
 *  1. Load environment variables
 *  2. Start Express HTTP server (health check + admin API)
 *  3. Query Supabase for all active businesses
 *  4. Connect each business number to WhatsApp via Baileys
 *  5. Expose a /status endpoint and a /webhook/reload endpoint
 */

require('dotenv').config();

const express = require('express');
const supabase = require('./config/supabase');
const { connectBusiness, getStatus, getQRCode } = require('./services/whatsappService');
const QRCode = require('qrcode');
const { invalidateCache } = require('./services/botEngine');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'whatsapp-bot-mvp', uptime: process.uptime() });
});

// ─── WhatsApp connection status ──────────────────────────────────────────────
app.get('/status', (_req, res) => {
    res.json({ connections: getStatus() });
});

/**
 * GET /qr/:whatsapp_number
 * Returns the current QR code as a PNG image.
 */
app.get('/qr/:number', async (req, res) => {
    const { number } = req.params;
    const qrString = getQRCode(number);

    if (!qrString) {
        return res.status(404).send('QR not found or already connected.');
    }

    try {
        const qrImage = await QRCode.toBuffer(qrString);
        res.type('image/png');
        res.send(qrImage);
    } catch (err) {
        logger.error({ err, number }, 'Failed to generate QR image');
        res.status(500).send('Error generating QR code');
    }
});

/**
 * Dashboard (Simple HTML list)
 */
app.get('/dashboard', (_req, res) => {
    const statuses = getStatus();
    const rows = Object.entries(statuses)
        .map(([number, data]) => {
            const statusColor = data.connected ? 'green' : 'orange';
            const statusText = data.connected ? 'Connected' : 'Waiting for QR';
            const qrLink = data.connected 
                ? '✅' 
                : `<a href="/qr/${encodeURIComponent(number)}" target="_blank">Scan QR</a>`;
            
            return `
            <tr>
                <td>${number}</td>
                <td style="color: ${statusColor}">${statusText}</td>
                <td>${qrLink}</td>
            </tr>`;
        })
        .join('');

    res.send(`
        <html>
            <head>
                <title>WhatsApp Bot Dashboard</title>
                <style>
                    body { font-family: sans-serif; padding: 2rem; background: #f8f9fa; }
                    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
                    th, td { padding: 1rem; border-bottom: 1px solid #eee; text-align: left; }
                    th { background: #008069; color: white; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
                    h1 { color: #1c1e21; margin: 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>WhatsApp Bot Dashboard</h1>
                    <button onclick="location.reload()">Refresh</button>
                </div>
                <table>
                    <tr><th>WhatsApp Number</th><th>Status</th><th>Action</th></tr>
                    ${rows || '<tr><td colspan="3">No businesses found.</td></tr>'}
                </table>
                <p><small>Tip: Add new businesses in Supabase then call <code>POST /webhook/reload</code> or restart.</small></p>
            </body>
        </html>
    `);
});

/**
 * POST /webhook/reload
 * Body: { "whatsapp_number": "+5491112345678" }
 *
 * Invalidates the in-memory business config cache for the given number
 * so the next message picks up changes from Supabase immediately.
 */
app.post('/webhook/reload', (req, res) => {
    const { whatsapp_number } = req.body || {};
    if (!whatsapp_number) {
        return res.status(400).json({ error: 'whatsapp_number is required' });
    }
    invalidateCache(whatsapp_number);
    logger.info({ whatsapp_number }, 'Cache invalidated via webhook');
    res.json({ success: true, whatsapp_number });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function loadAndConnectBusinesses() {
    logger.info('Fetching active businesses from Supabase…');

    const { data: businesses, error } = await supabase
        .from('businesses')
        .select('whatsapp_number, business_name')
        .eq('active', true);

    if (error) {
        logger.error({ error }, 'Failed to fetch businesses from Supabase');
        throw error;
    }

    if (!businesses || businesses.length === 0) {
        logger.warn(
            'No active businesses found. Add rows to the `businesses` table and restart the server.'
        );
        return;
    }

    logger.info({ count: businesses.length }, 'Connecting businesses to WhatsApp…');

    // Connect all businesses concurrently (QR codes will print to terminal)
    await Promise.allSettled(
        businesses.map(({ whatsapp_number, business_name }) =>
            connectBusiness(whatsapp_number, business_name).catch((err) =>
                logger.error({ err, whatsapp_number }, 'Failed to connect business')
            )
        )
    );
}

async function main() {
    // Start HTTP server first so Railway's health checks pass immediately
    app.listen(PORT, () => {
        logger.info({ port: PORT }, '🚀 HTTP server started');
        logger.info(`🌐 Dashboard: http://localhost:${PORT}/dashboard`);
    });

    try {
        await loadAndConnectBusinesses();
    } catch (err) {
        logger.error({ err }, 'Fatal error during bootstrap');
        process.exit(1);
    }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down gracefully');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
});

main();
