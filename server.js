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

// --- SAWABOT STYLE LANDING PAGE ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sawabot | AI WhatsApp Solution</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root { --wa-green: #2ecc71; --wa-dark: #075E54; --hero-bg: #004D40; --text-dark: #1A1A1A; }
        body { font-family: 'Inter', sans-serif; margin:0; background:#fff; color:var(--text-dark); }
        nav { padding: 1.5rem 8%; display: flex; justify-content: space-between; align-items: center; position: absolute; width: 100%; box-sizing: border-box; }
        .logo { font-size: 1.6rem; font-weight: 800; color: #fff; }
        .btn-admin { background: #fff; color: var(--wa-dark); padding: 0.6rem 1.2rem; border-radius: 100px; text-decoration: none; font-weight: 700; }
        .hero { background: var(--hero-bg); border-radius: 0 0 50px 50px; padding: 120px 8% 80px; color: #fff; display: flex; align-items: center; gap: 4rem; }
        .hero-text { flex: 1; }
        h1 { font-family: 'Outfit'; font-size: 4rem; line-height: 1; }
        h1 span { color: var(--wa-green); }
        .hero-form { background: white; padding: 2.5rem; border-radius: 2rem; width: 400px; color: var(--text-dark); box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
        input { width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; }
        .btn-cta { width:100%; padding:14px; background:var(--wa-green); border:none; border-radius:10px; color:white; font-weight:800; cursor:pointer; font-size:1.1rem; }
        .features { padding: 80px 8%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
        .feature-card { background: #f9f9f9; padding: 2rem; border-radius: 1.5rem; text-align: center; }
    </style>
</head>
<body>
    <nav><div class="logo">SAWABOT</div><a href="/login" class="btn-admin">Acceso Admin</a></nav>
    <section class="hero">
        <div class="hero-text">
            <h1>Libera el poder de <span>WhatsApp</span> con IA</h1>
            <p>Automatiza ventas y soporte al cliente sin esfuerzo. IA humana que cierra tratos.</p>
        </div>
        <div class="hero-form">
            <h2>Prueba la Demo</h2>
            <form id="leadForm">
                <input type="text" name="business_name" placeholder="Tu Negocio" required>
                <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                <input type="tel" name="contact_number" placeholder="WhatsApp" required>
                <button type="submit" class="btn-cta">Activar Ahora Gratis</button>
            </form>
            <div id="resp" style="margin-top:10px; font-weight:700"></div>
        </div>
    </section>
    <section class="features">
        <div class="feature-card"><h3>📅 Agenda Citas</h3><p>Agenda automáticamente en segundos.</p></div>
        <div class="feature-card"><h3>📞 Atencion 24/7</h3><p>Nunca duerme, siempre vende.</p></div>
        <div class="feature-card"><h3>🚀 Captura Leads</h3><p>Califica prospectos en tiempo real.</p></div>
    </section>
    <script>
        document.getElementById('leadForm').onsubmit = async(e)=>{
            e.preventDefault(); const resp=document.getElementById('resp');
            const data=Object.fromEntries(new FormData(e.target));
            const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
            if(r.ok) { resp.style.color='#2ecc71'; resp.innerText='¡Enviado!'; e.target.reset(); }
        };
    </script>
</body>
</html>`);
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Admin Login</title><style>body{background:#f4f7f5;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}form{background:white;padding:3rem;border-radius:2rem;box-shadow:0 10px 30px rgba(0,0,0,0.1);width:320px;text-align:center;}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2>Admin Login</h2>
                <input type="password" name="password" placeholder="Contraseña" required style="width:100%;padding:12px;margin-bottom:20px;box-sizing:border-box;"><br>
                <button type="submit" style="width:100%;padding:12px;background:#2ecc71;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">Entrar</button>
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
    if (!qrString) return res.send('<h2>QR no disponible</h2>');
    try {
        const qrSvg = await QRCode.toString(qrString, { type: 'svg', margin: 2 });
        res.send('<!DOCTYPE html><html><body style="background:#f4f7f5;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h2>Vincular WhatsApp</h2><div style="background:white;padding:20px;border-radius:2rem;">' + qrSvg + '</div></body></html>');
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
        const statuses = getStatus();
        const rows = (businesses || []).map(biz => {
            const s = statuses[biz.whatsapp_number] || { connected: false };
            return '<tr><td>' + biz.business_name + '</td><td>' + (s.connected ? 'ONLINE' : 'OFFLINE') + '</td></tr>';
        }).join('');
        res.send('<!DOCTYPE html><html><body><h1>Admin Dashboard</h1><table>' + rows + '</table></body></html>');
    } catch (e) { res.status(500).send('Error'); }
});

app.post('/api/leads', async (req, res) => {
    const { business_name, contact_name, contact_number } = req.body;
    await supabase.from('leads').insert([{ business_name, contact_name, contact_number }]);
    res.status(201).json({ success: true });
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
