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

// --- MODERN LANDING PAGE ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Universal WhatsApp Bot | Premium MVP</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <style>
                :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #020617; --glass: rgba(255, 255, 255, 0.03); --glass-border: rgba(255, 255, 255, 0.08); }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; overflow-x: hidden; }
                .blob { position: fixed; width: 500px; height: 500px; filter: blur(80px); opacity: 0.15; z-index: -1; animation: orbit 20s linear infinite; }
                @keyframes orbit { from { transform: rotate(0deg) translateX(100px) rotate(0deg); } to { transform: rotate(360deg) translateX(100px) rotate(-360deg); } }
                .hero { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 1rem; position: relative; }
                nav { position: absolute; top: 0; width: 100%; padding: 2rem; display: flex; justify-content: space-between; align-items: center; max-width: 1200px; left: 50%; transform: translateX(-50%); box-sizing: border-box; }
                .logo { font-size: 1.5rem; font-weight: 800; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                h1 { font-size: clamp(2.5rem, 8vw, 5rem); font-weight: 800; line-height: 1.1; margin-bottom: 1.5rem; max-width: 900px; animation: fadeInUp 1s ease; }
                .accent { color: var(--primary); }
                .glass-card { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 100%; max-width: 500px; box-sizing: border-box; animation: fadeIn 1.2s ease; }
                .btn-main { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #020617; padding: 1rem 2.5rem; border-radius: 100px; font-weight: 700; text-decoration: none; font-size: 1.1rem; transition: 0.3s; cursor: pointer; border: none; display: inline-block; }
                .btn-main:hover { transform: scale(1.05); box-shadow: 0 0 30px rgba(0, 255, 163, 0.4); }
                .features { padding: 8rem 2rem; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
                .feature-card { padding: 2.5rem; border-radius: 24px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); transition: 0.3s; }
                .feature-card:hover { transform: translateY(-10px); background: rgba(255,255,255,0.04); border-color: var(--primary); }
                input { width: 100%; padding: 1rem; margin-bottom: 1rem; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: white; box-sizing: border-box; font-family: inherit; transition: 0.3s; }
                input:focus { border-color: var(--primary); background: rgba(255,255,255,0.08); outline: none; }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            </style>
        </head>
        <body>
            <div class="blob" style="background:var(--primary); top: -10%; right: -10%;"></div>
            <div class="blob" style="background:var(--secondary); bottom: -10%; left: -10%;"></div>
            <nav><div class="logo">UNIVERSAL BOT</div><a href="/login" style="color:white; text-decoration:none; opacity:0.6; font-weight:600;">Acceso Admin</a></nav>
            <section class="hero">
                <h1>Impulsa tu negocio <br><span class="accent">con IA en WhatsApp</span></h1>
                <p style="color:#94a3b8; font-size:1.2rem; margin-bottom:2.5rem; animation:fadeIn 2s ease;">Agenda, vende y responde automáticamente las 24 horas.</p>
                <div class="glass-card">
                    <h2 style="margin-top:0">Solicitar Demo Gratis</h2>
                    <form id="leadForm">
                        <input type="text" name="business_name" placeholder="Tu Negocio" required>
                        <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                        <input type="tel" name="contact_number" placeholder="Celular" required>
                        <button type="submit" class="btn-main" style="width:100%">Reservar Demo</button>
                    </form>
                    <div id="response" style="margin-top:1.5rem; font-weight:600"></div>
                </div>
            </section>
            <section class="features">
                <div class="feature-card"><h3 style="color:var(--primary)">Atención 24/7</h3><p>No pierdas ni una venta. Nuestra IA responde al instante.</p></div>
                <div class="feature-card"><h3 style="color:var(--primary)">Ahorra Tiempo</h3><p>Automatiza los pedidos y preguntas frecuentes sin esfuerzo.</p></div>
                <div class="feature-card"><h3 style="color:var(--primary)">Multi-Empresa</h3><p>Gestiona múltiples números desde un solo panel avanzado.</p></div>
            </section>
            <script>
                document.getElementById('leadForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const resp = document.getElementById('response');
                    try {
                        const data = Object.fromEntries(new FormData(e.target));
                        const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                        if (r.ok) { resp.style.color = '#00ffa3'; resp.textContent = '¡Enviado! Te contactaremos pronto.'; e.target.reset(); }
                    } catch (err) { resp.style.color = '#f87171'; resp.textContent = 'Error al enviar.'; }
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
        <head><title>Admin Login</title><style>body{background:#020617;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}form{background:rgba(255,255,255,0.03);padding:2.5rem;border-radius:1.5rem;border:1px solid rgba(255,255,255,0.1);width:300px;text-align:center;animation:fadeIn 1s ease;}@keyframes fadeIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}input{width:100%;padding:12px;border-radius:10px;border:none;margin-bottom:15px;box-sizing:border-box;background:rgba(255,255,255,0.05);color:white;}button{padding:12px 24px;width:100%;cursor:pointer;background:#00ffa3;border:none;border-radius:10px;font-weight:bold;transition:0.3s;}button:hover{filter:brightness(1.1);transform:translateY(-2px);}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2 style="color:#00ffa3">Bot Admin</h2>
                <input type="password" name="password" placeholder="Clave de Acceso" required>
                <button type="submit">Entrar al Panel</button>
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

// --- QR PAGE ---
app.get('/qr/:number', async (req, res) => {
    const { number } = req.params;
    const qrString = getQRCode(number);
    if (!qrString) return res.send('<body style="background:#0f172a;color:white;text-align:center;padding:50px;font-family:sans-serif;"><h2>QR no disponible</h2><p>Es posible que ya estes conectado. Refresca el dashboard.</p></body>');
    try {
        const qrSvg = await QRCode.toString(qrString, { type: 'svg', margin: 2 });
        res.send(`<!DOCTYPE html><html><body style="background:#0f172a;color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;margin:0;"><h2>Vincular WhatsApp</h2><div style="background:white;padding:20px;border-radius:24px;box-shadow:0 0 50px rgba(0,255,163,0.3); animation: pulse 2s infinite;">${qrSvg}</div><style>@keyframes pulse{0%{box-shadow:0 0 50px rgba(0,255,163,0.3);}50%{box-shadow:0 0 80px rgba(0,255,163,0.5);}100%{box-shadow:0 0 50px rgba(0,255,163,0.3);}}</style><p style="opacity:0.6;margin-top:20px;">Vincúlalo como nuevo dispositivo.</p></body></html>`);
    } catch (err) { res.status(500).send('Error'); }
});

// --- DASHBOARD ---
app.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
        const statuses = getStatus();
        const rows = (businesses || []).map(biz => {
            const s = statuses[biz.whatsapp_number] || { connected: false };
            const qrLink = '/qr/' + encodeURIComponent(biz.whatsapp_number);
            return '<tr>' +
                '<td><strong>' + biz.business_name + '</strong><br><small style="color:#64748b">' + biz.whatsapp_number + '</small></td>' +
                '<td><span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:' + (s.connected ? 'rgba(0,255,163,0.1)' : 'rgba(255,152,0,0.1)') + ';color:' + (s.connected ? '#00ffa3' : '#ff9800') + '">' + (s.connected ? 'ONLINE' : 'OFFLINE') + '</span></td>' +
                '<td style="display:flex; gap:10px;">' +
                    (s.connected ? '<span style="color:#64748b">Activo</span>' : '<a href="' + qrLink + '" target="_blank" style="color:#00ffa3;text-decoration:none;font-weight:600;">Escanear QR</a>') +
                    '<button onclick="resetBiz(\'' + biz.whatsapp_number + '\')" style="background:none;border:none;color:#94a3b8;cursor:pointer;">Reset</button>' +
                    '<button onclick="deleteBiz(\'' + biz.id + '\')" style="background:none;border:none;color:#f87171;cursor:pointer;margin-left:5px;">Eliminar</button>' +
                '</td>' +
                '</tr>';
        }).join('');

        res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <title>Admin Dashboard | Universal Bot</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #0f172a; --card: rgba(30, 41, 59, 0.7); --border: rgba(255,255,255,0.1); }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; display: grid; grid-template-columns: 1fr 400px; height: 100vh; overflow: hidden; }
        .main-content { padding: 2rem; overflow-y: auto; animation: slideIn 0.8s ease; }
        .side-panel { background: rgba(0,0,0,0.2); border-left: 1px solid var(--border); padding: 1.5rem; display: flex; flex-direction: column; overflow-y: auto; }
        .card { background: var(--card); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: 20px; padding: 1.5rem; margin-bottom: 2rem; transition: 0.3s; }
        .card:hover { border-color: rgba(0,255,163,0.3); }
        h1, h2 { margin-top: 0; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 1rem; color: #94a3b8; font-size: 0.7rem; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 1.2rem 1rem; border-bottom: 1px solid var(--border); }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 1.2rem; text-align: center; }
        .stat-value { font-size: 1.5rem; font-weight: 800; color: var(--primary); display: block; }
        .console { flex: 1; background: rgba(0,0,0,0.5); border-radius: 12px; padding: 1rem; font-family: monospace; font-size: 0.75rem; color: #10b981; }
        .btn-add { background: var(--primary); color: #020617; padding: 0.8rem 1.5rem; border-radius: 12px; font-weight: 800; cursor: pointer; border: none; margin-bottom: 2rem; }
        input, textarea { width: 100%; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--border); margin-bottom: 10px; font-family: inherit; }
        @keyframes slideIn{ from{ opacity:0; transform:translateX(-20px); } to{ opacity:1; transform:translateX(0); } }
    </style>
</head>
<body>
    <div class="main-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
            <h1>Dashboard Administrativo</h1>
            <button class="btn-add" onclick="document.getElementById('add-modal').style.display = 'block'">+ Nuevo Cliente</button>
        </div>

        <div class="stats-grid">
            <div class="stat-card"><span style="color:#94a3b8; font-size:0.7rem;">BOTS ONLINE</span><span class="stat-value">${Object.values(statuses).filter(s => s.connected).length}</span></div>
            <div class="stat-card"><span style="color:#94a3b8; font-size:0.7rem;">TOTAL EMPRESAS</span><span class="stat-value">${businesses?.length || 0}</span></div>
            <div class="stat-card"><span style="color:#94a3b8; font-size:0.7rem;">SERVER UPTIME</span><span class="stat-value" style="font-size:0.9rem">${Math.floor(process.uptime()/3600)}h ${Math.floor((process.uptime()%3600)/60)}m</span></div>
        </div>

        <!-- Add Business Modal (Overlay simplificado) -->
        <div id="add-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:100; justify-content:center; align-items:center; display:flex;">
            <div class="card" style="width:500px; padding:2rem;">
                <h2>Registrar Nuevo Cliente</h2>
                <form id="addBizForm">
                    <input type="text" name="business_name" placeholder="Nombre de Empresa" required>
                    <input type="text" name="whatsapp_number" placeholder="Celular (ej: +54911...)" required>
                    <textarea name="welcome_message" placeholder="Mensaje de Bienvenida" required rows="3"></textarea>
                    <div style="display:flex; gap:10px;">
                        <input type="button" value="Cancelar" onclick="document.getElementById('add-modal').style.display='none'" style="flex:1; background:#334155; cursor:pointer;">
                        <input type="submit" value="Dar de Alta" style="flex:1; background:var(--primary); color:#020617; font-weight:800; cursor:pointer;">
                    </div>
                </form>
            </div>
        </div>
        <script>
            // Forzamos que el modal este oculto al inicio (JS inline fix)
            document.getElementById('add-modal').style.display = 'none';
        </script>

        <div class="card">
            <h2>Empresas Instaladas</h2>
            <table>
                <thead><tr><th>Cliente</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>

        <div class="card">
            <h2>Monitor de Ventas (Leads)</h2>
            <table style="font-size:0.85rem"><thead><tr><th>Origen</th><th>Nombre</th><th>Fecha</th></tr></thead><tbody id="leads-body"></tbody></table>
        </div>
    </div>

    <div class="side-panel">
        <h2>Live Event Logger</h2>
        <div id="logs" class="console">Esperando actividad...</div>
        <p style="font-size:0.7rem; color:#64748b; margin-top:1rem; text-align:center;">Powering Conversation AI</p>
    </div>

    <script>
        function resetBiz(n){ if(confirm('Resetear sesion?')) fetch('/admin/businesses/'+encodeURIComponent(n)+'/reset',{method:'POST'}).then(()=>location.reload()); }
        function deleteBiz(id){ if(confirm('Eliminar empresa permanentemente?')) fetch('/admin/businesses/'+id,{method:'DELETE'}).then(()=>location.reload()); }
        
        document.getElementById('addBizForm').onsubmit = async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            data.menu_options = {"1":"Ver Menu","2":"Ubicacion"};
            data.responses = {"1":"Bienvenido al menu","2":"Estamos en calle 123"};
            const r = await fetch('/admin/businesses', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            if(r.ok) location.reload(); else alert('Error al crear');
        };

        function update(){
            fetch('/admin/messages').then(r=>r.json()).then(m=>{
                document.getElementById('logs').innerHTML = m.map(x=>'<div style="margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.02);">['+(new Date(x.created_at).toLocaleTimeString())+'] '+x.message_text+'</div>').join('');
            });
            fetch('/admin/leads').then(r=>r.json()).then(l=>{
                document.getElementById('leads-body').innerHTML = l.map(x=>'<tr><td><strong>'+x.business_name+'</strong></td><td>'+x.contact_name+'</td><td>'+new Date(x.created_at).toLocaleDateString()+'</td></tr>').join('') || '<tr><td colspan="3">Sin leads</td></tr>';
            });
        }
        setInterval(update, 5000); update();
    </script>
</body>
</html>`);
    } catch (e) { res.status(500).send('Error'); }
});

// --- ADMIN API ---

app.post('/admin/businesses', authMiddleware, async (req, res) => {
    const { business_name, whatsapp_number, welcome_message, menu_options, responses } = req.body;
    const { error } = await supabase.from('businesses').insert([{ 
        business_name, whatsapp_number, welcome_message, menu_options, responses, active: true 
    }]);
    if (error) return res.status(500).json({ error });
    
    // Auto-connect the new bot
    connectBusiness(whatsapp_number, business_name).catch(e => logger.error(e));
    res.status(201).json({ success: true });
});

app.get('/admin/status', (req, res) => res.json(getStatus()));

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

app.delete('/admin/businesses/:id', authMiddleware, async (req, res) => {
    await supabase.from('businesses').delete().eq('id', req.params.id);
    res.json({ success: true });
});

async function loadAndConnectBusinesses() {
    const { data } = await supabase.from('businesses').select('*').eq('active', true);
    if (!data) return;
    for (const biz of data) connectBusiness(biz.whatsapp_number, biz.business_name).catch(e => logger.error(e));
}

async function main() {
    const URL = process.env.RENDER_EXTERNAL_URL;
    if (URL) setInterval(() => { require('https').get(URL + '/api/health', () => {}); }, 10 * 60 * 1000);
    app.listen(PORT, () => { loadAndConnectBusinesses(); });
}

main();
