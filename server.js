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

// ─── Basic Auth Middleware ───────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'password123';

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Se requiere autenticación.');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === adminUser && pass === adminPass) {
        return next();
    } else {
        res.set('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Credenciales incorrectas.');
    }
};

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'whatsapp-bot-mvp', uptime: process.uptime() });
});

// ─── WhatsApp connection status ──────────────────────────────────────────────
app.get('/status', (_req, res) => {
    res.json({ connections: getStatus() });
});

// ─── Protected Routes ────────────────────────────────────────────────────────
app.use(['/dashboard', '/qr', '/webhook/reload', '/admin'], authMiddleware);

/**
 * DELETE /admin/businesses/:id
 * Removes a business and its references.
 */
app.delete('/admin/businesses/:id', async (req, res) => {
    const { id } = req.params;
    logger.info({ id }, 'Deleting business request');
    try {
        // Find business details before deleting
        const { data: biz, error: findError } = await supabase
            .from('businesses')
            .select('whatsapp_number')
            .eq('id', id)
            .single();

        if (findError) throw new Error('Business not found in database');

        if (biz) {
            const { whatsapp_number } = biz;
            const { disconnectBusiness } = require('./services/whatsappService');
            
            logger.info({ whatsapp_number }, 'Disconnecting and clearing session');
            
            // 1. Terminate active socket
            await disconnectBusiness(whatsapp_number);
            
            // 2. Clear credentials from Supabase
            const { error: sessionError } = await supabase
                .from('whatsapp_sessions')
                .delete()
                .eq('whatsapp_number', whatsapp_number);
            
            if (sessionError) logger.error({ sessionError }, 'Failed to clear session from DB');
        }

        // 3. Delete business record
        const { error: deleteError } = await supabase.from('businesses').delete().eq('id', id);
        if (deleteError) throw deleteError;

        res.json({ success: true });
    } catch (err) {
        logger.error({ err }, 'Error in DELETE /admin/businesses');
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /admin/businesses
 * Adds a new business to Supabase and starts a WhatsApp connection.
 */
app.post('/admin/businesses', express.urlencoded({ extended: true }), async (req, res) => {
    const { business_name, whatsapp_number, description } = req.body;

    if (!business_name || !whatsapp_number) {
        return res.status(400).send('Nombre y número son obligatorios.');
    }

    try {
        const { error } = await supabase
            .from('businesses')
            .insert([{
                business_name,
                whatsapp_number,
                description,
                active: true
            }]);

        if (error) throw error;

        logger.info({ business_name, whatsapp_number }, 'New business added via Dashboard');
        
        // Start connection process immediately
        connectBusiness(whatsapp_number, business_name).catch(err => 
            logger.error({ err, whatsapp_number }, 'Failed to connect new business')
        );

        res.redirect('/dashboard?success=1');
    } catch (err) {
        logger.error({ err }, 'Error adding business');
        res.status(500).send('Error al guardar la empresa: ' + err.message);
    }
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
app.get('/dashboard', async (_req, res) => {
    // Fetch businesses from Supabase
    const { data: businesses } = await supabase
        .from('businesses')
        .select('whatsapp_number, business_name, id');

    const nameMap = (businesses || []).reduce((acc, b) => {
        acc[b.whatsapp_number] = b.business_name;
        return acc;
    }, {});

    const idMap = (businesses || []).reduce((acc, b) => {
        acc[b.whatsapp_number] = b.id;
        return acc;
    }, {});

    const statuses = getStatus();
    
    res.send(`
        <html>
            <head>
                <title>WhatsApp Bot Dashboard</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 2rem; background: #f0f2f5; color: #1c1e21; }
                    .container { max-width: 900px; margin: 0 auto; }
                    .card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 2rem; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                    th, td { padding: 1rem; border-bottom: 1px solid #e4e6eb; text-align: left; }
                    th { background: #008069; color: white; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
                    h1 { color: #008069; margin: 0; }
                    h2 { margin-top: 0; color: #1c1e21; border-bottom: 2px solid #008069; padding-bottom: 5px; }
                    .form-group { margin-bottom: 1rem; }
                    label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                    input, textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccd0d5; border-radius: 6px; box-sizing: border-box; }
                    button { background: #008069; color: white; border: none; padding: 0.7rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: bold; }
                    button:hover { background: #006e5a; }
                    .refresh-btn { background: #606770; }
                    .delete-btn { background: #dc3545; padding: 0.4rem 0.8rem; font-size: 0.85rem; }
                    .delete-btn:hover { background: #a71d2a; }
                    .success-msg { background: #d4edda; color: #155724; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; }
                    .actions { display: flex; gap: 10px; align-items: center; }
                    a { color: #008069; text-decoration: none; font-weight: bold; }
                    a:hover { text-decoration: underline; }
                </style>
                <script>
                    async function deleteBusiness(id) {
                        if (!confirm('¿Estás seguro de que quieres eliminar esta empresa? Se perderá la conexión y los datos.')) return;
                        const res = await fetch('/admin/businesses/' + id, { method: 'DELETE' });
                        if (res.ok) location.reload();
                        else alert('Error al eliminar');
                    }
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>WhatsApp Bot Universal</h1>
                        <button class="refresh-btn" onclick="location.reload()">Actualizar</button>
                    </div>

                    ${_req.query.success ? '<div class="success-msg">✅ Empresa agregada exitosamente.</div>' : ''}

                    <div class="card">
                        <h2>🚀 Empresas Activas</h2>
                        <table>
                            <tr><th>Empresa</th><th>Número</th><th>Estado</th><th>Acciones</th></tr>
                            ${Object.entries(statuses).map(([num, data]) => `
                                <tr>
                                    <td>${nameMap[num] || 'Desconocida'}</td>
                                    <td>${num}</td>
                                    <td style="color: ${data.connected ? '#25d366' : '#ff9800'}">
                                        ${data.connected ? '● Conectado' : '○ Esperando QR'}
                                    </td>
                                    <td class="actions">
                                        ${data.connected ? '✅' : `<a href="/qr/${encodeURIComponent(num)}" target="_blank">Escanear QR</a>`}
                                        <button class="delete-btn" onclick="deleteBusiness('${idMap[num]}')">Eliminar</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="4">No hay empresas configuradas.</td></tr>'}
                        </table>
                    </div>

                    <div class="card">
                        <h2>➕ Alta de Nueva Empresa</h2>
                        <form action="/admin/businesses" method="POST">
                            <div class="form-group">
                                <label>Nombre de la Empresa:</label>
                                <input type="text" name="business_name" placeholder="Ej: Restaurante Roma" required>
                            </div>
                            <div class="form-group">
                                <label>Número de WhatsApp (E.164):</label>
                                <input type="text" name="whatsapp_number" placeholder="Ej: +5491112345678" required>
                            </div>
                            <div class="form-group">
                                <label>Descripción para IA:</label>
                                <textarea name="description" placeholder="Describe brevemente de qué trata el negocio..." rows="3"></textarea>
                            </div>
                            <button type="submit">Guardar y Vincular</button>
                        </form>
                    </div>
                </div>
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

// ─── Keep Awake (Self-Ping) ──────────────────────────────────────────────────
// Pings the root URL every 10 minutes to prevent Render from sleeping the instance.
const axios = require('axios');
const SELF_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`;

setInterval(async () => {
    try {
        if (SELF_URL.includes('localhost')) return; // Don't ping on local
        await axios.get(SELF_URL);
        logger.debug('Self-ping successful — Staying awake');
    } catch (err) {
        logger.error({ err }, 'Self-ping failed');
    }
}, 10 * 60 * 1000); // 10 minutes
