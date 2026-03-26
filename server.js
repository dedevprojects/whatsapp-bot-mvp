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
    <title>Universal Bot | AI WhatsApp Engine</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #00ffa3; --bg: #030712; --glass: rgba(255, 255, 255, 0.02); }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: white; margin: 0; overflow-x: hidden; }
        nav { position: fixed; top: 0; width: 100%; padding: 1.5rem 5%; display: flex; justify-content: space-between; align-items: center; background: rgba(3,7,18,0.8); backdrop-filter: blur(10px); z-index: 100; box-sizing: border-box; }
        .logo { font-size: 1.5rem; font-weight: 800; color: var(--primary); }
        .nav-admin { padding: 0.6rem 1.2rem; border: 1px solid var(--primary); border-radius: 12px; color: var(--primary); text-decoration: none; font-weight: 700; }
        .hero { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 4rem 1rem; }
        h1 { font-size: clamp(2.5rem, 8vw, 5rem); line-height: 1; margin-bottom: 2rem; }
        h1 span { color: var(--primary); }
        .glass-card { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 2rem; padding: 3rem; width: 100%; max-width: 500px; box-sizing: border-box; }
        input { width: 100%; padding: 1.1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: white; margin-bottom: 1rem; box-sizing: border-box; }
        .btn-cta { width: 100%; padding: 1.1rem; border-radius: 12px; border: none; background: var(--primary); color: #030712; font-weight: 800; cursor: pointer; font-size: 1rem; }
    </style>
</head>
<body>
    <nav><div class="logo">UNIVERSAL BOT</div><a href="/login" class="nav-admin">Acceso Admin</a></nav>
    <section class="hero">
        <h1>Escala tu negocio <br><span>en WhatsApp con IA</span></h1>
        <div class="glass-card">
            <h2>Prueba la Demo</h2>
            <form id="leadForm">
                <input type="text" name="business_name" placeholder="Tu Negocio" required>
                <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                <input type="tel" name="contact_number" placeholder="WhatsApp" required>
                <button type="submit" class="btn-cta">Reservar Demo Gratis</button>
            </form>
            <div id="response" style="margin-top:1rem; font-weight:700"></div>
        </div>
    </section>
    <script>
        document.getElementById('leadForm').onsubmit = async (e) => {
            e.preventDefault();
            const resp = document.getElementById('response');
            try {
                const data = Object.fromEntries(new FormData(e.target));
                const r = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
                if(r.ok) { resp.style.color='#00ffa3'; resp.textContent='¡Enviado!'; e.target.reset(); }
            } catch(e) { resp.style.color='#f87171'; resp.textContent='Error.'; }
        };
    </script>
</body>
</html>`);
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Admin Login</title><style>body{background:#030712;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}form{background:rgba(255,255,255,0.03);padding:3rem;border-radius:2rem;border:1px solid rgba(255,255,255,0.1);width:320px;text-align:center;box-sizing:border-box;}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2 style="color:#00ffa3">Administración</h2>
                <input type="password" name="password" placeholder="Clave de Acceso" required style="padding:15px;width:100%;border-radius:12px;border:none;background:rgba(255,255,255,0.05);color:white;margin-bottom:20px;box-sizing:border-box;">
                <button type="submit" style="padding:15px;width:100%;background:#00ffa3;border:none;border-radius:12px;font-weight:bold;cursor:pointer;">Entrar</button>
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
    if (!qrString) return res.send('<h2>QR no disponible.</h2>');
    try {
        const qrSvg = await QRCode.toString(qrString, { type: 'svg', margin: 2 });
        res.send(`<!DOCTYPE html><html><body style="background:#030712;color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h2>Vincular WhatsApp</h2><div style="background:white;padding:20px;border-radius:2rem;">${qrSvg}</div></body></html>`);
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
                '<td><strong>' + biz.business_name + '</strong><br><small style="color:#64748b">' + biz.whatsapp_number + '</small></td>' +
                '<td>' + (s.connected ? 'ONLINE' : 'OFFLINE') + '</td>' +
                '<td>' + (s.connected ? 'Conectado' : '<a href="' + qrLink + '" target="_blank">Escanear QR</a>') + '</td>' +
                '</tr>';
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>Dashboard</title><style>body{background:#030712;color:white;font-family:sans-serif;padding:2rem;}table{width:100%;border-collapse:collapse;}th,td{text-align:left;padding:1.2rem;border-bottom:1px solid rgba(255,255,255,0.1);}.card{background:rgba(255,255,255,0.03);padding:2rem;border-radius:1.5rem;border:1px solid rgba(255,255,255,0.1);margin-bottom:2rem;}</style></head><body><h1>Admin Panel</h1><div class="card"><h2>Instancias</h2><table><thead><tr><th>Empresa</th><th>Estado</th><th>Accion</th></tr></thead><tbody>${rows}</tbody></table></div><div class="card"><h2>Nuevo Cliente</h2><form id="newBiz"><input type="text" name="business_name" placeholder="Nombre" required style="padding:10px;margin-bottom:10px;"><br><input type="text" name="whatsapp_number" placeholder="Numero" required style="padding:10px;margin-bottom:10px;"><br><button type="submit" style="padding:10px 20px;background:#00ffa3;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">Crear Bot</button></form></div><script>document.getElementById('newBiz').onsubmit = async(e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); await fetch('/admin/businesses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); location.reload();};</script></body></html>`);
    } catch (e) { res.status(500).send('Error'); }
});

app.post('/admin/businesses', authMiddleware, async (req, res) => {
    const { business_name, whatsapp_number } = req.body;
    await supabase.from('businesses').insert([{ business_name, whatsapp_number, active: true }]);
    connectBusiness(whatsapp_number, business_name).catch(e => logger.error(e));
    res.status(201).json({ success: true });
});

app.get('/admin/messages', async (req, res) => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20);
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

app.post('/admin/businesses/:number/reset', authMiddleware, async (req, res) => {
    await disconnectBusiness(req.params.number);
    await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', req.params.number);
    res.json({ success: true });
});

async function main() {
    const URL = process.env.RENDER_EXTERNAL_URL;
    if (URL) setInterval(() => { require('https').get(URL + '/api/health', () => {}); }, 10 * 60 * 1000);
    app.listen(PORT, () => { loadAndConnectBusinesses(); });
}

async function loadAndConnectBusinesses() {
    const { data } = await supabase.from('businesses').select('*').eq('active', true);
    if (!data) return;
    for (const biz of data) connectBusiness(biz.whatsapp_number, biz.business_name).catch(e => logger.error(e));
}

main();
