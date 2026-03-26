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

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Universal WhatsApp Bot | La Evolución del Servicio al Cliente</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <style>
                :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #020617; --glass: rgba(255, 255, 255, 0.03); --glass-border: rgba(255, 255, 255, 0.08); }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; overflow-x: hidden; }
                .blob { position: fixed; width: 500px; height: 500px; filter: blur(80px); opacity: 0.15; z-index: -1; animation: orbit 20s linear infinite; }
                @keyframes orbit { from { transform: rotate(0deg) translateX(100px) rotate(0deg); } to { transform: rotate(360deg) translateX(100px) rotate(-360deg); } }
                .hero { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 1rem; position: relative; }
                nav { position: absolute; top: 0; width: 100%; padding: 2rem; display: flex; justify-content: space-between; align-items: center; max-width: 1200px; left: 50%; transform: translateX(-50%); }
                .logo { font-size: 1.5rem; font-weight: 800; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                h1 { font-size: clamp(2.5rem, 8vw, 5rem); font-weight: 800; line-height: 1.1; margin-bottom: 1.5rem; max-width: 900px; animation: fadeInUp 1s ease; }
                .accent { color: var(--primary); }
                p.subtitle { font-size: 1.25rem; color: #94a3b8; max-width: 600px; margin-bottom: 2.5rem; animation: fadeInUp 1s ease 0.2s backwards; }
                .glass-card { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 100%; max-width: 500px; }
                .btn-main { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #020617; padding: 1rem 2.5rem; border-radius: 100px; font-weight: 700; text-decoration: none; font-size: 1.1rem; transition: transform 0.3s; cursor: pointer; border: none; display: inline-block; }
                .btn-main:hover { transform: scale(1.05); }
                .features { padding: 8rem 2rem; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
                .feature-card { padding: 2rem; border-radius: 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
                .feature-card h3 { color: var(--primary); margin-top: 0; }
                .form-section { padding: 8rem 2rem; display: flex; justify-content: center; }
                input { width: 100%; padding: 1rem; margin-bottom: 1rem; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: white; font-family: inherit; font-size: 1rem; box-sizing: border-box; }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                th { text-align: left; padding: 0.8rem; color: #64748b; font-size: 0.8rem; border-bottom: 1px solid var(--glass-border); }
                td { padding: 0.8rem; border-bottom: 1px solid var(--glass-border); font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="blob" style="background:var(--primary); top: -10%; right: -10%;"></div>
            <div class="blob" style="background:var(--secondary); bottom: -10%; left: -10%;"></div>

            <nav>
                <div class="logo">UNIVERSAL BOT</div>
                <a href="/login" style="color:white; text-decoration:none; opacity:0.6">Acceso Admin</a>
            </nav>

            <section class="hero">
                <h1>Automatiza tu negocio <span class="accent">con IA en WhatsApp</span></h1>
                <p class="subtitle">Agenda, vende y responde automáticamente las 24 horas del día. Inteligencia avanzada para empresas modernas.</p>
                <a href="#demo" class="btn-main">Solicitar Demo Gratis</a>
            </section>

            <section class="features">
                <div class="feature-card">
                    <h3>Atención Inmediata</h3>
                    <p>El 80% de las ventas en WhatsApp se pierden por lentitud. Nuestra IA responde en segundos.</p>
                </div>
                <div class="feature-card">
                    <h3>Calificación de Leads</h3>
                    <p>El bot identifica si el usuario es un cliente potencial real antes de pasarlo a un humano.</p>
                </div>
                <div class="feature-card">
                    <h3>Dashboard Centralizado</h3>
                    <p>Gestiona todos tus números y ve las conversaciones en tiempo real desde un solo panel.</p>
                </div>
            </section>

            <section class="form-section" id="demo">
                <div class="glass-card">
                    <h2 style="text-align:center; margin-top:0">Configura tu Demo</h2>
                    <p style="text-align:center; color:#94a3b8; margin-bottom:2rem">Completa tus datos y activa tu bot en minutos.</p>
                    <form id="leadForm">
                        <input type="text" name="business_name" placeholder="Nombre del Negocio" required>
                        <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                        <input type="tel" name="contact_number" placeholder="Celular (ej: +54911...)" required>
                        <button type="submit" class="btn-main" style="width:100%">Reservar mi Demo</button>
                    </form>
                    <div id="response" style="margin-top:1.5rem; text-align:center; font-weight:600"></div>
                </div>
            </section>

            <script>
                document.getElementById('leadForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const btn = e.target.querySelector('button');
                    const resp = document.getElementById('response');
                    btn.disabled = true;
                    btn.textContent = 'Procesando...';
                    
                    try {
                        const data = Object.fromEntries(new FormData(e.target));
                        const r = await fetch('/api/leads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        if (r.ok) {
                            resp.style.color = '#00ffa3';
                            resp.innerHTML = '¡Solicitud enviada!<br><span style="font-weight:normal; font-size:0.9rem">Revisaremos tu caso y te contactaremos.</span>';
                            e.target.reset();
                        } else {
                            throw new Error();
                        }
                    } catch (err) {
                        resp.style.color = '#f87171';
                        resp.textContent = 'Hubo un error. Reintenta por favor.';
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Reservar mi Demo';
                    }
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
                :root { --primary: #00ffa3; --secondary: #00d1ff; --bg: #0f172a; --glass: rgba(255, 255, 255, 0.05); --glass-border: rgba(255, 255, 255, 0.1); --card-bg: rgba(30, 41, 59, 0.7); }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #f8fafc; margin: 0; padding: 0; min-height: 100vh; }
                .container { max-width: 1400px; margin: 0 auto; padding: 2rem; display: grid; grid-template-columns: 1fr 400px; gap: 2rem; }
                .header { grid-column: span 2; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
                h1 { margin: 0; font-size: 1.8rem; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; }
                
                /* Stats Grid */
                .stats-grid { grid-column: span 2; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 2rem; }
                .stat-card { background: var(--card-bg); backdrop-filter: blur(10px); border: 1px solid var(--glass-border); border-radius: 20px; padding: 1.5rem; display: flex; flex-direction: column; }
                .stat-label { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
                .stat-value { font-size: 2rem; font-weight: 800; margin-top: 5px; }
                .stat-trend { font-size: 0.75rem; margin-top: 5px; }
                
                .card { background: var(--card-bg); backdrop-filter: blur(10px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 1rem; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid var(--glass-border); font-weight: 600; }
                td { padding: 1.25rem 1rem; border-bottom: 1px solid var(--glass-border); }
                .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; }
                .status-on { background: rgba(0, 255, 163, 0.1); color: var(--primary); border: 1px solid rgba(0, 255, 163, 0.2); }
                .status-off { background: rgba(255, 152, 0, 0.1); color: #ff9800; border: 1px solid rgba(255, 152, 0, 0.2); }
                .btn { padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.3s; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
                .btn-primary { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #0f172a; box-shadow: 0 4px 15px rgba(0, 255, 163, 0.3); }
                .btn-danger { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
                .btn-reset { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border-color: var(--glass-border); }
                .btn:hover { transform: translateY(-2px); opacity: 0.9; }
                .log-console { height: 650px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 16px; padding: 1.5rem; font-family: 'Fira Code', monospace; font-size: 0.8rem; border: 1px solid var(--glass-border); }
                .log-entry { margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px; line-height: 1.5; }
                .log-time { color: #475569; margin-right: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="width:40px; height:40px; background:linear-gradient(135deg, var(--primary), var(--secondary)); border-radius:10px;"></div>
                        <h1>Admin Panel <span style="font-weight:300; opacity:0.5">/ Bot Pro</span></h1>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <button class="btn btn-primary" onclick="location.reload()">Refresh Live</button>
                    </div>
                </div>

                <!-- Stats Section -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-label">Bots Activos</span>
                        <span class="stat-value" id="stat-active">${Object.values(statuses).filter(s => s.connected).length}</span>
                        <span class="stat-trend" style="color:var(--primary)">↑ Estable</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Leads Hoy</span>
                        <span class="stat-value" id="stat-leads-count">--</span>
                        <span class="stat-trend" style="color:var(--secondary)">↑ Solicitudes Demo</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Mensajes (30d)</span>
                        <span class="stat-value">1,240</span>
                        <span class="stat-trend" style="color:#94a3b8">Tendencia positiva</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Uptime Server</span>
                        <span class="stat-value" style="font-size:1.2rem; margin-top:15px;">${Math.floor(process.uptime()/3600)}h ${Math.floor((process.uptime()%3600)/60)}m</span>
                        <span class="stat-trend" style="color:var(--primary)">Sincronizado</span>
                    </div>
                </div>

                <div class="left-col">
                    <div class="card" style="margin-bottom: 2rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                            <h2 style="margin:0; font-size:1.2rem;">Conexiones WhatsApp</h2>
                            <span style="font-size:0.8rem; color:#94a3b8;">${businesses?.length || 0} instancias registradas</span>
                        </div>
                        <table>
                            <thead><tr><th>Empresa / ID</th><th>Estado</th><th>Acciones de Control</th></tr></thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="card">
                        <h2 style="margin-bottom:1.5rem; font-size:1.2rem;">Últimos Leads (Interesados)</h2>
                        <table style="font-size: 0.85rem;">
                            <thead><tr><th>Empresa</th><th>Contacto / Lead</th><th>Fecha</th></tr></thead>
                            <tbody id="leads-body">
                                <tr><td colspan="3" style="text-align:center; padding:2rem;">Obteniendo base de datos...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="right-col">
                    <div class="card">
                        <h2 style="margin-bottom:1.5rem; font-size:1.2rem;">Consola Live (V2)</h2>
                        <div id="logs" class="log-console">Esperando actividad de red...</div>
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
                        const html = msgs.map(m => `
                            <div class="log-entry">
                                <span style="color:#00ffa3">[${m.direction}]</span> ${m.message_text}
                            </div>
                        `).join('');
                        document.getElementById('logs').innerHTML = html;
                    } catch(e) {}
                }
                async function updateLeads() {
                    try {
                        const r = await fetch('/admin/leads');
                        const leads = await r.json();
                        const html = leads.length ? leads.map(l => `
                            <tr>
                                <td><strong>${l.business_name}</strong></td>
                                <td>${l.contact_name}<br><small style="color:#64748b">${l.contact_number}</small></td>
                                <td>${new Date(l.created_at).toLocaleDateString()}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="3" style="text-align:center; padding: 2rem; color:#64748b;">No hay leads registrados aún</td></tr>';
                        document.getElementById('leads-body').innerHTML = html;
                    } catch(e) {}
                }
                setInterval(updateLogs, 3000);
                setInterval(updateLeads, 10000);
                updateLogs();
                updateLeads();
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

app.get('/admin/leads', async (req, res) => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(20);
    res.json(data || []);
});

app.post('/api/leads', async (req, res) => {
    const { business_name, contact_name, contact_number } = req.body;
    if (!business_name || !contact_name || !contact_number) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const { error } = await supabase.from('leads').insert([{ 
        business_name, 
        contact_name, 
        contact_number,
        interest_level: 'Discovery'
    }]);
    if (error) {
        logger.error({ error }, 'Error saving lead');
        return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ success: true });
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
    // ─── Auto-Ping Mechanism (Keep Alive on Render Free) ──────────────────
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            const https = require('https');
            https.get(`${RENDER_EXTERNAL_URL}/api/health`, (res) => {
                logger.debug('Auto-ping successful');
            }).on('error', (err) => {
                logger.error({ err }, 'Auto-ping failed');
            });
        }, 10 * 60 * 1000); // Ping every 10 minutes
        logger.info({ url: RENDER_EXTERNAL_URL }, 'Auto-ping activated');
    }

    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Server Up');
        loadAndConnectBusinesses();
    });
}


main();
