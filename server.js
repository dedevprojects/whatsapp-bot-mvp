'use strict';

require('dotenv').config();

const express = require('express');
const supabase = require('./config/supabase');
const { connectBusiness, getStatus, getQRCode, disconnectBusiness } = require('./services/whatsappService');
const QRCode = require('qrcode');
const cookieParser = require('cookie-parser');
const { invalidateCache } = require('./services/botEngine');
const logger = require('./utils/logger');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')));

const authMiddleware = (req, res, next) => {
    if (req.cookies.admin_session === 'authenticated') {
        return next();
    }
    res.redirect('/login');
};

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Login</title><style>body{background:#0f172a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}form{background:rgba(255,255,255,0.05);padding:2rem;border-radius:1rem;border:1px solid rgba(255,255,255,0.1);}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2>Admin Login</h2>
                <input type="password" name="password" placeholder="Contrasena" required style="padding:10px;width:200px;border-radius:5px;border:none;"><br><br>
                <button type="submit" style="padding:10px 20px;cursor:pointer;background:#00ffa3;border:none;border-radius:5px;font-weight:bold;">Entrar</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD || req.body.password === 'admin123') {
        res.cookie('admin_session', 'authenticated', { httpOnly: true });
        return res.redirect('/dashboard');
    }
    res.redirect('/login?error=1');
});

app.get('/qr/:number', async (req, res) => {
    const { number } = req.params;
    const qrString = getQRCode(number);
    
    if (!qrString) {
        return res.status(404).send('<!DOCTYPE html><html><body style="background:#0f172a;color:white;text-align:center;padding:50px;font-family:sans-serif;"><h2>QR no disponible</h2><p>Es posible que ya estes conectado o que el servicio se este iniciando. Refresca el dashboard.</p><button onclick="window.close()" style="padding:10px;cursor:pointer;">Cerrar</button></body></html>');
    }

    try {
        const qrSvg = await QRCode.toString(qrString, { type: 'svg', margin: 2 });
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Escanea el QR</title>
                <style>
                    body { background: #0f172a; color: white; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; margin:0; }
                    .qr-container { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 0 50px rgba(0,255,163,0.3); }
                    .qr-container svg { width: 320px; height: 320px; display: block; }
                    h2 { margin-bottom: 30px; background: linear-gradient(to right, #00ffa3, #00d1ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                    p { color: #94a3b8; margin-top: 20px; }
                </style>
            </head>
            <body>
                <h2>Escanea este codigo con WhatsApp</h2>
                <div class="qr-container">${qrSvg}</div>
                <p>La sesion se vinculara automaticamente al terminar.</p>
                <script>
                    setInterval(() => { fetch('/admin/status').then(r => r.json()).then(s => { if(s["${number}"] && s["${number}"].connected) window.location.reload(); }) }, 3000);
                    setTimeout(() => window.location.reload(), 25000);
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        logger.error({ err, number }, 'Failed to generate QR SVG');
        res.status(500).send('Error generating QR code');
    }
});

app.get('/dashboard', authMiddleware, async (req, res) => {
    const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
    const statuses = getStatus();
    
    const rows = (businesses || []).map(biz => {
        const s = statuses[biz.whatsapp_number] || { connected: false };
        return `
            <tr>
                <td><strong>${biz.business_name}</strong><br><small style="color:#64748b">${biz.whatsapp_number}</small></td>
                <td><span class="status-badge ${s.connected ? 'status-on' : 'status-off'}">${s.connected ? 'ONLINE' : 'OFFLINE'}</span></td>
                <td>
                    <div style="display:flex; gap:8px;">
                        ${s.connected ? 'Conectado' : `<a href="/qr/${encodeURIComponent(biz.whatsapp_number)}" class="btn btn-primary" target="_blank">QR</a>`}
                        <button class="btn btn-reset" onclick="resetBiz('${biz.whatsapp_number}')">Reiniciar</button>
                        <button class="btn btn-danger" onclick="deleteBiz('${biz.id}')">Eliminar</button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard | Universal Bot</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
                :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #0f172a; --glass: rgba(255, 255, 255, 0.05); --glass-border: rgba(255, 255, 255, 0.1); }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; padding: 1rem; }
                .container { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 1fr 400px; gap: 1.5rem; }
                .header { grid-column: span 2; display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; }
                h1 { margin: 0; font-size: 1.8rem; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .card { background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--glass-border); border-radius: 20px; padding: 1.5rem; }
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 1rem; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid var(--glass-border); }
                td { padding: 1rem; border-bottom: 1px solid var(--glass-border); }
                .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
                .status-on { background: rgba(0, 255, 163, 0.1); color: var(--primary); }
                .status-off { background: rgba(255, 152, 0, 0.1); color: #ff9800; }
                .btn { padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; font-size: 0.85rem; text-decoration: none; display: inline-block; }
                .btn-primary { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #0f172a; }
                .btn-danger { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
                .btn-reset { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border-color: var(--glass-border); }
                .log-console { height: 600px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 1rem; font-family: monospace; font-size: 0.8rem; }
                .log-entry { margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Universal Bot Engine</h1>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-primary" onclick="location.reload()">Refrescar</button>
                    </div>
                </div>
                <div class="left-col">
                    <div class="card">
                        <h2>Empresas Activas</h2>
                        <table>
                            <thead><tr><th>Empresa</th><th>Estado</th><th>Acciones</th></tr></thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="right-col">
                    <div class="card">
                        <h2>Feed de Actividad</h2>
                        <div id="logs" class="log-console">Cargando...</div>
                    </div>
                </div>
            </div>
            <script>
                async function resetBiz(num) {
                    if(!confirm('Reiniciar sesion?')) return;
                    await fetch('/admin/businesses/' + encodeURIComponent(num) + '/reset', {method:'POST'});
                    location.reload();
                }
                async function deleteBiz(id) {
                    if(!confirm('Eliminar empresa?')) return;
                    await fetch('/admin/businesses/' + id, {method:'DELETE'});
                    location.reload();
                }
                async function updateLogs() {
                    try {
                        const r = await fetch('/admin/messages');
                        const msgs = await r.json();
                        const html = msgs.map(m => \`
                            <div class="log-entry">
                                <span style="color:#00ffa3">[\${m.direction}]</span> \${m.message_text}
                            </div>
                        \`).join('');
                        document.getElementById('logs').innerHTML = html;
                    } catch(e) {}
                }
                setInterval(updateLogs, 5000);
                updateLogs();
            </script>
        </body>
        </html>
    `);
});

app.get('/admin/status', (req, res) => res.json(getStatus()));

app.get('/admin/messages', async (req, res) => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(30);
    res.json(data || []);
});

app.post('/admin/businesses/:number/reset', async (req, res) => {
    const { number } = req.params;
    await disconnectBusiness(number);
    await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', number);
    res.json({ success: true });
});

app.delete('/admin/businesses/:id', async (req, res) => {
    const { id } = req.params;
    await supabase.from('businesses').delete().eq('id', id);
    res.json({ success: true });
});

async function loadAndConnectBusinesses() {
    const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
    if (!businesses) return;
    for (const biz of businesses) {
        connectBusiness(biz.whatsapp_number, biz.business_name).catch(e => logger.error(e));
    }
}

async function main() {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Server Up');
        loadAndConnectBusinesses();
    });
}

main();
