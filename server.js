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
const cookieParser = require('cookie-parser');
const { invalidateCache } = require('./services/botEngine');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
    if (req.cookies.admin_session === 'authenticated') {
        return next();
    }
    res.redirect('/login');
};

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'whatsapp-bot-mvp', uptime: process.uptime() });
});

// ─── Stunning Landing Page ───────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Universal WhatsApp Bot | Escala tu Negocio</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <style>
                :root {
                    --primary: #00ffa3;
                    --secondary: #00d1ff;
                    --dark: #020617;
                    --slate-800: #1e293b;
                    --glass: rgba(255, 255, 255, 0.03);
                    --glass-border: rgba(255, 255, 255, 0.08);
                }
                * { box-sizing: border-box; scroll-behavior: smooth; }
                body {
                    margin: 0;
                    font-family: 'Outfit', sans-serif;
                    background: var(--dark);
                    color: white;
                    overflow-x: hidden;
                }
                
                /* Background Elements */
                .blob {
                    position: absolute;
                    width: 600px;
                    height: 600px;
                    background: radial-gradient(circle, rgba(0, 255, 163, 0.1) 0%, rgba(2, 6, 23, 0) 70%);
                    z-index: -1;
                    filter: blur(80px);
                }

                header {
                    padding: 1.5rem 5%;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: sticky;
                    top: 0;
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    z-index: 100;
                    border-bottom: 1px solid var(--glass-border);
                }
                .logo {
                    font-size: 1.5rem;
                    font-weight: 800;
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                nav a {
                    color: #94a3b8;
                    text-decoration: none;
                    margin-left: 2rem;
                    font-weight: 500;
                    transition: 0.3s;
                }
                nav a:hover { color: var(--primary); }
                .btn-login {
                    background: var(--glass);
                    border: 1px solid var(--glass-border);
                    color: white;
                    padding: 0.6rem 1.2rem;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: 0.3s;
                }
                .btn-login:hover { background: rgba(255,255,255,0.1); }

                /* Hero Section */
                .hero {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    padding: 8rem 10% 4rem;
                    align-items: center;
                    gap: 4rem;
                    min-height: 90vh;
                }
                .hero-text h1 {
                    font-size: 4rem;
                    line-height: 1.1;
                    margin-bottom: 1.5rem;
                    font-weight: 800;
                }
                .hero-text p {
                    color: #94a3b8;
                    font-size: 1.25rem;
                    line-height: 1.6;
                    margin-bottom: 2.5rem;
                }
                .hero-visual { position: relative; }
                .hero-image {
                    width: 100%;
                    max-width: 500px;
                    border-radius: 40px;
                    box-shadow: 0 0 50px rgba(0, 255, 163, 0.2);
                    animation: float 6s ease-in-out infinite;
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                }

                .cta-main {
                    padding: 1.2rem 2.5rem;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    color: var(--dark);
                    border: none;
                    border-radius: 16px;
                    font-size: 1.1rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: 0.4s;
                    box-shadow: 0 10px 30px rgba(0, 255, 163, 0.3);
                }
                .cta-main:hover {
                    transform: scale(1.05);
                    box-shadow: 0 15px 40px rgba(0, 255, 163, 0.5);
                }

                /* Features */
                .features {
                    padding: 6rem 10%;
                    text-align: center;
                }
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 2rem;
                    margin-top: 4rem;
                }
                .feature-card {
                    background: var(--glass);
                    border: 1px solid var(--glass-border);
                    padding: 3rem 2rem;
                    border-radius: 32px;
                    transition: 0.4s;
                }
                .feature-card:hover {
                    background: rgba(255,255,255,0.06);
                    transform: translateY(-10px);
                }
                .feature-card i {
                    font-size: 3rem;
                    margin-bottom: 1.5rem;
                    display: block;
                }
                .feature-card h3 { margin-bottom: 1rem; }
                .feature-card p { color: #64748b; line-height: 1.5; }

                /* Demos */
                .demos {
                    background: rgba(0,0,0,0.2);
                    padding: 6rem 10%;
                }
                .demo-pills {
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    margin-top: 2rem;
                    flex-wrap: wrap;
                }
                .pill {
                    padding: 10px 20px;
                    background: var(--glass);
                    border: 1px solid var(--glass-border);
                    border-radius: 50px;
                    font-weight: 600;
                    color: #94a3b8;
                }

                @media (max-width: 900px) { ... }

                /* Modal Styles */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0; top: 0; width: 100%; height: 100%;
                    background-color: rgba(0,0,0,0.8);
                    backdrop-filter: blur(8px);
                }
                .modal-content {
                    background: var(--dark);
                    margin: 10% auto;
                    padding: 3rem;
                    border: 1px solid var(--glass-border);
                    border-radius: 24px;
                    width: 90%;
                    max-width: 500px;
                    position: relative;
                    box-shadow: 0 0 100px rgba(0, 255, 163, 0.1);
                }
                .close {
                    position: absolute;
                    right: 1.5rem; top: 1rem;
                    color: #94a3b8; font-size: 2rem; cursor: pointer;
                }
                .form-group { margin-bottom: 1.5rem; text-align: left; }
                input, textarea {
                    width: 100%; padding: 0.8rem 1rem;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid var(--glass-border);
                    border-radius: 12px; color: white; margin-top: 0.5rem;
                }
            </style>
        </head>
        <body>
            <div id="leadModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="closeModal()">&times;</span>
                    <h2>Solicitar Demo</h2>
                    <p style="color: #94a3b8">Déjanos tus datos y un especialista te contactará.</p>
                    <form id="leadForm">
                        <div class="form-group">
                            <label>Nombre de tu Negocio</label>
                            <input type="text" name="business_name" required>
                        </div>
                        <div class="form-group">
                            <label>Tu Nombre</label>
                            <input type="text" name="contact_name" required>
                        </div>
                        <div class="form-group">
                            <label>WhatsApp (con código de país)</label>
                            <input type="text" name="contact_number" placeholder="+54..." required>
                        </div>
                        <button type="submit" class="cta-main" style="width: 100%">Enviar Solicitud</button>
                    </form>
                </div>
            </div>
            <div class="blob" style="top: -200px; left: -200px;"></div>
            <div class="blob" style="bottom: -200px; right: -200px; background: radial-gradient(circle, rgba(0, 209, 255, 0.1) 0%, rgba(2, 6, 23, 0) 70%);"></div>

            <header>
                <div class="logo">UNIVERSAL BOT</div>
                <nav>
                    <a href="#funciona">Funcionamiento</a>
                    <a href="#beneficios">Beneficios</a>
                    <button class="btn-login" onclick="location.href='/login'">Admin Access</button>
                </nav>
            </header>

            <section class="hero">
                <div class="hero-text">
                    <h1>Tu WhatsApp. <br><span style="background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Piloto Automático.</span></h1>
                    <p>Atiende a cientos de clientes simultáneamente, califica leads y concreta ventas en segundos con nuestro motor multi-tenant de nueva generación.</p>
                    <button class="cta-main" onclick="openModal()">Solicitar una Demo</button>
                </div>
                <div class="hero-visual">
                    <img src="/mockup_visual" alt="Mockup" class="hero-image">
                </div>
            </section>

            <section class="features" id="funciona">
                <h2>Diseñado para Escalar</h2>
                <div class="features-grid">
                    <div class="feature-card">
                        <i>🏢</i>
                        <h3>Multi-Tenancy Real</h3>
                        <p>Una sola instancia servidor gestiona números infinitos de diferentes empresas de forma aislada y segura.</p>
                    </div>
                    <div class="feature-card">
                        <i>🤖</i>
                        <h3>IA Conectiva</h3>
                        <p>No son simples respuestas. Nuestra IA entiende el contexto y guía al usuario hacia la conversión final.</p>
                    </div>
                    <div class="feature-card">
                        <i>📊</i>
                        <h3>Live Dashboard</h3>
                        <p>Monitorea cada conversación en tiempo real. Intervén cuando sea necesario o deja que el bot cierre la venta.</p>
                    </div>
                </div>
            </section>

            <section class="demos">
                <h2 style="text-align: center;">Especializado por Industrias</h2>
                <p style="text-align: center; color: #94a3b8;">Nuestros bots ya están configurados para sectores clave:</p>
                <div class="demo-pills">
                    <span class="pill">🍕 Restaurantes (Roma Pasta)</span>
                    <span class="pill">💪 Fitness & Gyms (Titan Gym)</span>
                    <span class="pill">✨ Estética & Spa (Lotus Spa)</span>
                    <span class="pill">🏠 Inmobiliarias</span>
                    <span class="pill">🚗 Concesionarias</span>
                </div>
            </section>

            <footer style="padding: 4rem 10%; border-top: 1px solid var(--glass-border); text-align: center; color: #64748b;">
                <p>&copy; 2026 Universal WhatsApp Bot Engine. Todos los derechos reservados.</p>
            </footer>

            <script>
                const modal = document.getElementById("leadModal");
                function openModal() { modal.style.display = "block"; }
                function closeModal() { modal.style.display = "none"; }
                window.onclick = function(event) { if (event.target == modal) closeModal(); }

                document.getElementById('leadForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    try {
                        const r = await fetch('/api/leads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        const res = await r.json();
                        if(res.success) {
                            alert('¡Gracias! Te contactaremos pronto.');
                            closeModal();
                            e.target.reset();
                        } else {
                            alert('Error: ' + res.error);
                        }
                    } catch(err) {
                        alert('Error de conexión.');
                    }
                };
            </script>
        </body>
        </html>
    `);
});

/**
 * Endpoint for the mockup image (serving generated artifact locally)
 */
app.get('/mockup_visual', (req, res) => {
    // Note: In real production, this would be a static asset in /public
    // For this demonstration, we'll try to find the latest generated artifact
    const fs = require('fs');
    const path = require('path');
    const artifactDir = 'C:\\Users\\DIEGO\\.gemini\\antigravity\\brain\\095de708-e7f4-4ad9-a723-6616e676f7d5';
    const files = fs.readdirSync(artifactDir).filter(f => f.startsWith('bot_landing_mockup') && f.endsWith('.png'));
    if (files.length > 0) {
        const latest = files.sort().reverse()[0];
        res.sendFile(path.join(artifactDir, latest));
    } else {
        res.status(404).send('Image not generated');
    }
});

// ─── WhatsApp connection status ──────────────────────────────────────────────
app.get('/status', (_req, res) => {
    res.json({ connections: getStatus() });
});

// ─── Protected Routes ────────────────────────────────────────────────────────
app.use(['/dashboard', '/qr', '/webhook/reload', '/admin'], authMiddleware);

/**
 * GET /login
 * Stunning login page
 */
app.get('/login', (req, res) => {
    if (req.cookies.admin_session === 'authenticated') {
        return res.redirect('/dashboard');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login | Universal Bot</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
                :root {
                    --primary: #00ffa3;
                    --secondary: #00d1ff;
                    --bg: #0f172a;
                    --glass: rgba(255, 255, 255, 0.05);
                    --glass-border: rgba(255, 255, 255, 0.1);
                }
                body {
                    margin: 0;
                    font-family: 'Outfit', sans-serif;
                    background: var(--bg);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    overflow: hidden;
                }
                .bg-glow {
                    position: absolute;
                    width: 500px;
                    height: 500px;
                    background: radial-gradient(circle, rgba(0, 255, 163, 0.15) 0%, rgba(15, 23, 42, 0) 70%);
                    border-radius: 50%;
                    filter: blur(50px);
                    z-index: -1;
                }
                .login-card {
                    background: var(--glass);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--glass-border);
                    padding: 3rem;
                    border-radius: 24px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                    animation: fadeIn 0.8s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                h1 {
                    font-size: 2rem;
                    margin-bottom: 0.5rem;
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                p { color: #94a3b8; margin-bottom: 2rem; }
                .form-group { text-align: left; margin-bottom: 1.5rem; }
                label { display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #cbd5e1; }
                input {
                    width: 100%;
                    padding: 0.8rem 1rem;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--glass-border);
                    border-radius: 12px;
                    color: white;
                    font-size: 1rem;
                    box-sizing: border-box;
                    transition: all 0.3s;
                }
                input:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 4px rgba(0, 255, 163, 0.1);
                }
                button {
                    width: 100%;
                    padding: 1rem;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    border: none;
                    border-radius: 12px;
                    color: #0f172a;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s, opacity 0.2s;
                    margin-top: 1rem;
                }
                button:hover {
                    transform: scale(1.02);
                    opacity: 0.9;
                }
                .error { color: #f87171; font-size: 0.85rem; margin-bottom: 1rem; }
            </style>
        </head>
        <body>
            <div class="bg-glow" style="top: -10%; right: -10%;"></div>
            <div class="bg-glow" style="bottom: -10%; left: -10%;"></div>
            
            <div class="login-card">
                <h1>Universal Bot</h1>
                <p>Acceso al Panel de Control</p>
                
                ${req.query.error ? '<div class="error">Credenciales incorrectas. Intente de nuevo.</div>' : ''}
                
                <form action="/login" method="POST">
                    <div class="form-group">
                        <label>Usuario</label>
                        <input type="text" name="user" required autofocus>
                    </div>
                    <div class="form-group">
                        <label>Contraseña</label>
                        <input type="password" name="pass" required>
                    </div>
                    <button type="submit">Entrar al Sistema</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

/**
 * POST /login
 */
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (user === adminUser && pass === adminPass) {
        res.cookie('admin_session', 'authenticated', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.redirect('/dashboard');
    } else {
        res.redirect('/login?error=1');
    }
});

/**
 * GET /logout
 */
app.get('/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.redirect('/login');
});

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
app.post('/admin/businesses', async (req, res) => {
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
    if (!qrString) return res.status(404).send('QR not found or already connected.');
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
 * GET /admin/messages
 * Latest 30 messages for the live log console
 */
app.get('/admin/messages', async (req, res) => {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*, businesses(business_name)')
        .order('created_at', { ascending: false })
        .limit(30);
    if (error) return res.status(500).json({ error: error.message });
    res.json(messages);
});

/**
 * POST /admin/businesses/:number/reset
 * Forced disconnect and session clear
 */
app.post('/admin/businesses/:number/reset', async (req, res) => {
    const { number } = req.params;
    const { disconnectBusiness } = require('./services/whatsappService');
    try {
        const { data: biz } = await supabase.from('businesses').select('business_name').eq('whatsapp_number', number).single();
        await disconnectBusiness(number);
        await supabase.from('whatsapp_sessions').delete().eq('whatsapp_number', number);
        if (biz) connectBusiness(number, biz.business_name).catch(e => logger.error(e));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Dashboard (Simple HTML list)
 */
app.get('/dashboard', async (_req, res) => {
    const { data: businesses } = await supabase.from('businesses').select('*').eq('active', true);
    const statuses = getStatus();
    
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
                .btn { padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; font-size: 0.85rem; }
                .btn-primary { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #0f172a; }
                .btn-danger { background: rgba(248, 113, 113, 0.1); color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
                .btn-reset { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border-color: var(--glass-border); }
                .log-console { height: 600px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 1rem; font-family: monospace; font-size: 0.8rem; }
                .log-entry { margin-bottom: 8px; padding-left: 8px; border-left: 2px solid #334155; }
                .log-in { border-left-color: var(--secondary); }
                .log-out { border-left-color: var(--primary); }
                .log-biz { font-weight: 600; color: #94a3b8; margin-right: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Universal Bot Engine</h1>
                    <div style="display:flex; gap:10px;">
                        <span id="uptime-display" style="color:#64748b; font-size:0.9rem; align-self:center;"></span>
                        <button class="btn btn-reset" onclick="location.href='/logout'">Salir</button>
                        <button class="btn btn-primary" onclick="location.reload()">Refrescar</button>
                    </div>
                </div>

                <div class="left-col">
                    <div class="card" style="margin-bottom:1.5rem;">
                        <h2>🚀 Empresas Activas</h2>
                        <table>
                            <thead><tr><th>Empresa</th><th>Estado</th><th>Acciones</th></tr></thead>
                            <tbody>
                                ${(businesses || []).map(biz => {
                                    const s = statuses[biz.whatsapp_number] || { connected: false };
                                    return `
                                        <tr>
                                            <td><strong>${biz.business_name}</strong><br><small style="color:#64748b">${biz.whatsapp_number}</small></td>
                                            <td><span class="status-badge ${s.connected ? 'status-on' : 'status-off'}">${s.connected ? 'ONLINE' : 'OFFLINE'}</span></td>
                                            <td>
                                                <div style="display:flex; gap:8px;">
                                                    ${s.connected ? '✅' : `<a href="/qr/${encodeURIComponent(biz.whatsapp_number)}" class="btn btn-primary" target="_blank" style="text-decoration:none">QR</a>`}
                                                    <button class="btn btn-reset" onclick="resetBiz('${biz.whatsapp_number}')" title="Reiniciar Conexión">🔄</button>
                                                    <button class="btn btn-danger" onclick="deleteBiz('${biz.id}')">🗑️</button>
                                                </div>
                                            </td>
                                        </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="card">
                        <h2>➕ Nueva Empresa</h2>
                        <form action="/admin/businesses" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <input type="text" name="business_name" placeholder="Nombre" required>
                            <input type="text" name="whatsapp_number" placeholder="+549..." required>
                            <textarea name="description" placeholder="Descripción para la IA..." style="grid-column:span 2" rows="2"></textarea>
                            <button type="submit" class="btn btn-primary" style="grid-column:span 2">Crear Negocio</button>
                        </form>
                    </div>
                </div>

                <div class="right-col">
                    <div class="card">
                        <h2>💬 Live Chat Feed</h2>
                        <div id="logs" class="log-console">Cargando historial...</div>
                    </div>
                </div>
            </div>

            <script>
                async function resetBiz(num) {
                    if(!confirm('¿Reiniciar sesión?')) return;
                    await fetch('/admin/businesses/' + encodeURIComponent(num) + '/reset', {method:'POST'});
                    location.reload();
                }
                async function deleteBiz(id) {
                    if(!confirm('¿Eliminar empresa?')) return;
                    await fetch('/admin/businesses/' + id, {method:'DELETE'});
                    location.reload();
                }
                async function updateLogs() {
                    try {
                        const r = await fetch('/admin/messages');
                        const msgs = await r.json();
                        const html = msgs.map(m => \`
                            <div class="log-entry \${m.direction === 'inbound' ? 'log-in' : 'log-out'}">
                                <span class="log-biz">[\${m.businesses?.business_name || 'Bot'}]</span>
                                <span style="color:#64748b; font-size:0.75rem">\${new Date(m.created_at).toLocaleTimeString()}</span><br>
                                \${m.message_text}
                            </div>
                        \`).join('');
                        document.getElementById('logs').innerHTML = html || 'No hay mensajes aún.';
                    } catch(e) {}
                }
                setInterval(updateLogs, 5000);
                updateLogs();
            </script>
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

/**
 * POST /api/leads
 * Saves a new lead from the landing page.
 */
app.post('/api/leads', async (req, res) => {
    const { business_name, contact_name, contact_number } = req.body;
    if (!contact_number) return res.status(400).json({ error: 'Número de contacto requerido' });
    
    try {
        const { error } = await supabase.from('leads').insert([{
            business_name,
            contact_name,
            contact_number,
            interest_level: 'High'
        }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        logger.error({ err }, 'Error saving lead');
        res.status(500).json({ error: err.message });
    }
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
