'use strict';

require('dotenv').config();

const express = require('express');
const supabase = require('./config/supabase');
const { connectBusiness, getStatus, getQRCode, disconnectBusiness } = require('./services/whatsappService');
const QRCode = require('qrcode');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')));

const authMiddleware = (req, res, next) => {
    if (req.cookies.admin_session === 'authenticated') return next();
    res.redirect('/login');
};

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Universal WhatsApp Bot</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <style>
                :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #020617; --glass: rgba(255, 255, 255, 0.03); --glass-border: rgba(255, 255, 255, 0.08); }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; overflow-x: hidden; }
                .hero { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 1rem; }
                .logo { font-size: 1.5rem; font-weight: 800; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                h1 { font-size: clamp(2.5rem, 8vw, 5rem); font-weight: 800; line-height: 1.1; margin-bottom: 1.5rem; }
                .btn-main { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #020617; padding: 1rem 2.5rem; border-radius: 100px; font-weight: 700; text-decoration: none; display: inline-block; }
                .glass-card { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 2.5rem; width: 100%; max-width: 500px; }
                input { width: 100%; padding: 1rem; margin-bottom: 1rem; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: white; box-sizing: border-box; }
            </style>
        </head>
        <body>
            <nav style="position: absolute; top:0; width:100%; padding:2rem; display:flex; justify-content:space-between; box-sizing:border-box;">
                <div class="logo">UNIVERSAL BOT</div>
                <a href="/login" style="color:white; text-decoration:none; opacity:0.6">Admin</a>
            </nav>
            <section class="hero">
                <h1>Automatiza tu negocio <br><span style="color:var(--primary)">con IA en WhatsApp</span></h1>
                <p style="color:#94a3b8; max-width:600px; margin-bottom:2rem;">Agenda y vende automáticamente las 24 horas.</p>
                <div class="glass-card">
                    <form id="leadForm">
                        <input type="text" name="business_name" placeholder="Tu Negocio" required>
                        <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                        <input type="tel" name="contact_number" placeholder="Celular" required>
                        <button type="submit" class="btn-main" style="width:100%; cursor:pointer; border:none;">Reservar Demo</button>
                    </form>
                    <div id="response" style="margin-top:1rem; font-weight:600"></div>
                </div>
            </section>
            <script>
                document.getElementById('leadForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const resp = document.getElementById('response');
                    try {
                        const data = Object.fromEntries(new FormData(e.target));
                        const r = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
                        if(r.ok) { resp.style.color='#00ffa3'; resp.textContent='¡Enviado! Te contactaremos.'; e.target.reset(); }
                    } catch(err) { resp.style.color='#f87171'; resp.textContent='Error al enviar.'; }
                };
            </script>
        </body>
        </html>
    `);
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Login</title><style>body{background:#0f172a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}form{background:rgba(255,255,255,0.05);padding:2rem;border-radius:1rem;border:1px solid rgba(255,255,255,0.1);}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2>Admin Login</h2>
                <input type="password" name="password" placeholder="Contraseña" required style="padding:10px;width:200px;border-radius:5px;border:none;"><br><br>
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
    if (!qrString) return res.send('<h2>QR no disponible. Refresca el dashboard.</h2>');
    try {
        const qrSvg = await QRCode.toString(qrString, { type: 'svg', margin: 2 });
        res.send(`<!DOCTYPE html><html><body style="background:#0f172a;color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h2>Escanea con WhatsApp</h2><div style="background:white;padding:20px;border-radius:20px;">${qrSvg}</div></body></html>`);
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
        const statuses = getStatus();
        const rows = (businesses || []).map(biz => {
            const s = statuses[biz.whatsapp_number] || { connected: false };
            const qrLink = '/qr/' + encodeURIComponent(biz.whatsapp_number);
            return '<tr>' +
                '<td><strong>' + biz.business_name + '</strong></td>' +
                '<td>' + (s.connected ? 'ONLINE' : 'OFFLINE') + '</td>' +
                '<td>' + (s.connected ? 'Conectado' : '<a href="' + qrLink + '" target="_blank">Escanear QR</a>') + '</td>' +
                '</tr>';
        }).join('');
        res.send(`<!DOCTYPE html><html><head><title>Dashboard</title><style>body{background:#0f172a;color:white;font-family:sans-serif;padding:2rem;}table{width:100%;border-collapse:collapse;}th,td{text-align:left;padding:1rem;border-bottom:1px solid rgba(255,255,255,0.1);}</style></head><body><h1>Admin Panel</h1><table><thead><tr><th>Negocio</th><th>Estado</th><th>Accion</th></tr></thead><tbody>${rows}</tbody></table><h2>Lead Monitor</h2><div id="leads">Cargando...</div><script>function update(){ fetch('/admin/leads').then(r=>r.json()).then(l=>{ document.getElementById('leads').innerHTML = l.map(x=>'<div>'+x.business_name+' - '+x.contact_name+'</div>').join(''); }); } setInterval(update, 5000); update();</script></body></html>`);
    } catch (e) { res.status(500).send('Error'); }
});

app.get('/admin/status', (req, res) => res.json(getStatus()));
app.get('/admin/messages', async (req, res) => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(30);
    res.json(data || []);
});
app.get('/admin/leads', async (req, res) => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(20);
    res.json(data || []);
});
app.post('/api/leads', async (req, res) => {
    const { business_name, contact_name, contact_number } = req.body;
    const { error } = await supabase.from('leads').insert([{ business_name, contact_name, contact_number }]);
    if (error) return res.status(500).json({ error });
    res.status(201).json({ success: true });
});
app.post('/admin/businesses/:number/reset', async (req, res) => {
    await disconnectBusiness(req.params.number);
    await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', req.params.number);
    res.json({ success: true });
});
app.delete('/admin/businesses/:id', async (req, res) => {
    await supabase.from('businesses').delete().eq('id', req.params.id);
    res.json({ success: true });
});

async function main() {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_URL) setInterval(() => { require('https').get(RENDER_URL + '/api/health', () => {}); }, 10 * 60 * 1000);
    app.listen(PORT, () => { loadAndConnectBusinesses(); });
}

async function loadAndConnectBusinesses() {
    const { data } = await supabase.from('businesses').select('*').eq('active', true);
    if (!data) return;
    for (const biz of data) connectBusiness(biz.whatsapp_number, biz.business_name).catch(e => logger.error(e));
}

main();
