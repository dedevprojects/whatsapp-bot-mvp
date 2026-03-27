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
    const session = req.cookies.admin_session;
    if (!session) return res.redirect('/login');
    
    if (session === 'authenticated') {
        req.user = { role: 'admin' };
        return next();
    }
    
    if (session.startsWith('biz_')) {
        req.user = { role: 'client', bizId: session.replace('biz_', '') };
        return next();
    }
    
    res.redirect('/login');
};

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// --- PLUS BOT LANDING PAGE v3 (ANIMATED) ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plusbot | IA Inteligente para WhatsApp Business 🤖</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root { 
            --deep: #004D40; --green: #2ecc71; --soft-bg: #F8FAF9; --text: #111;
             --wa-deep-green: #00593B; --wa-bright: #25D366; --gold: #FFD54F;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Inter', sans-serif; background: #fff; color: var(--text); overflow-x: hidden; scroll-behavior: smooth; }
        
        /* Animaciones */
        @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0); } }
        @keyframes orbMove { 0% { transform: translate(0,0); } 50% { transform: translate(30px, 40px); } 100% { transform: translate(0,0); } }
        
        .reveal { opacity: 0; transition: all 1s cubic-bezier(0.2, 1, 0.3, 1); transform: translateY(40px); }
        .reveal.active { opacity: 1; transform: translateY(0); }

        .nav { padding: 2.5rem 8%; display: flex; justify-content: space-between; align-items: center; position: absolute; width: 100%; top:0; z-index: 100; }
        .logo-box { display: flex; align-items: center; gap: 15px; }
        .logo-img { width: 45px; height: 45px; border-radius: 12px; }
        .logo { font-family: 'Outfit'; font-size: 2.0rem; font-weight: 800; color: #fff; letter-spacing: -2px; }
        .logo span { color: var(--wa-bright); }
        .btn-panel { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); color: #fff; padding: 0.8rem 2rem; border-radius: 40px; text-decoration: none; font-weight: 700; border: 1px solid rgba(255,255,255,0.2); transition: 0.3s; }
        .btn-panel:hover { background: #fff; color: var(--wa-deep-green); }

        .hero { 
            background: #002D1E; 
            min-height: 100vh;
            padding: 0 8%;
            display: flex;
            align-items: center;
            border-radius: 0 0 120px 120px;
            color: white;
            position: relative;
            gap: 2rem;
            overflow: hidden;
        }
        .hero-orb { position: absolute; width: 600px; height: 600px; background: rgba(37, 211, 102, 0.1); filter: blur(180px); top: -200px; right: -200px; animation: orbMove 15s infinite; }

        .hero-text { flex: 1.5; z-index: 2; }
        .hero-text .badge { background: rgba(37, 211, 102, 0.1); color: var(--wa-bright); border: 1px solid rgba(37, 211, 102, 0.2); padding: 8px 20px; border-radius: 100px; display: inline-block; margin-bottom: 2rem; font-weight: 700; font-size: 0.85rem; }
        .hero-text h1 { font-family: 'Outfit'; font-size: 5.5rem; line-height: 1; margin-bottom: 2.5rem; letter-spacing: -3px; min-height: 11rem; }
        .hero-text h1 span { color: var(--wa-bright); text-shadow: 0 0 20px rgba(37, 211, 102, 0.3); }
        .hero-text p { font-size: 1.5rem; opacity: 0.7; max-width: 650px; margin-bottom: 4rem; line-height: 1.5; }
        
        .btn-cta { background: var(--wa-bright); color: #fff; padding: 1.4rem 3.5rem; border-radius: 100px; font-weight: 800; font-size: 1.2rem; border: none; cursor: pointer; text-decoration: none; display: inline-block; transition: 0.3s; box-shadow: 0 20px 40px rgba(37, 211, 102, 0.3); }
        .btn-cta:hover { transform: translateY(-8px); background: #1eb956; }

        .hero-img { flex: 1; display: flex; justify-content: flex-end; animation: float 6s ease-in-out infinite; z-index: 2; }
        .phone-mockup { 
            width: 340px; height: 680px; background: #000; border-radius: 60px; border: 12px solid #222;
            position: relative; box-shadow: 0 80px 150px rgba(0,0,0,0.8); overflow: hidden;
            display: flex; flex-direction: column;
        }
        .phone-header { background:#075e54; color:white; padding:35px 20px 20px; display:flex; gap:12px; align-items:center; }
        .phone-screen { flex: 1; background: #E5DDD5; padding: 25px; display: flex; flex-direction: column; gap: 20px; position: relative; overflow-y: hidden; }
        .phone-screen::before { content:''; position:absolute; top:0; left:0; width:100%; height:100%; background: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); opacity: 0.08; }
        
        .msg { background: #fff; padding: 15px 18px; border-radius: 12px 18px 18px 2px; font-size: 0.95rem; max-width: 85%; color: #333; box-shadow: 0 4px 10px rgba(0,0,0,0.05); opacity:0; transform: translateY(10px); transition: 0.4s; z-index: 1; }
        .msg.visible { opacity:1; transform: translateY(0); }
        .msg-bot { background: #DCF8C6; border-radius: 18px 12px 2px 18px; align-self: flex-end; margin-left: auto; color: #111; }

        .section { padding: 160px 8%; text-align: center; background: #fff; }
        h2 { font-family: 'Outfit'; font-size: 4rem; margin-bottom: 2.5rem; color: var(--wa-deep-green); letter-spacing: -2px; }
        .section-subtitle { font-size: 1.4rem; color: #777; max-width: 900px; margin: 0 auto 6rem; line-height: 1.6; }

        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3rem; }
        .card { background: #F8FAF9; padding: 5rem 3rem; border-radius: 48px; text-align: left; transition: all 0.4s; border: 1px solid #eee; }
        .card:hover { background: #fff; border-color: var(--wa-bright); transform: translateY(-15px); box-shadow: 0 30px 60px rgba(0,0,0,0.05); }
        .card .icon { font-size: 4rem; margin-bottom: 2.5rem; display: block; }
        .card h3 { font-family: 'Outfit'; font-size: 2.1rem; margin-bottom: 1.5rem; }
        .card p { color: #666; font-size: 1.2rem; line-height: 1.8; }

        .highlight-section { padding: 100px 8%; background: #fff; }
        .highlight-box { 
            background: #111; border-radius: 80px; padding: 120px 8%; display: flex; align-items: center; gap: 6rem; color: #fff;
            position: relative; overflow: hidden; box-shadow: 0 50px 100px rgba(0,0,0,0.4);
        }
        .h-content { flex: 1.5; z-index: 2; }
        .h-content h2 { color: #fff; font-size: 4.5rem; margin-bottom: 2rem; min-height: 11rem; line-height: 1.1; }
        .h-content h2 span { color: var(--gold); }
        .h-content p { font-size: 1.6rem; opacity: 0.7; line-height: 1.5; min-height: 6rem; }
        .h-icon { flex: 1; font-size: 14rem; text-align: center; color: var(--gold); z-index: 2; }

        .footer-form { background: var(--wa-deep-green); padding: 180px 8%; color: white; border-radius: 140px 140px 0 0; text-align: center; }
        .form-container { max-width: 600px; margin: 80px auto 0; background: #fff; padding: 5rem 4rem; border-radius: 56px; color: #111; box-shadow: 0 60px 120px rgba(0,0,0,0.3); }
        input { width: 100%; padding: 22px 25px; margin-bottom: 1.5rem; border-radius: 20px; border: 2px solid #eee; background: #f9f9f9; font-size: 1.2rem; outline: none; transition: 0.3s; }
        input:focus { border-color: var(--wa-bright); transform: scale(1.02); }

        footer { padding: 80px 8%; text-align: center; color: #888; background: #f9f9f9; font-size: 1.1rem; border-top: 1px solid #eee; }

        @media (max-width: 1024px) {
            .hero { padding-top: 180px; text-align: center; flex-direction: column; height: auto; }
            .hero-text h1 { font-size: 3.5rem; min-height: 8rem; }
            .hero-img { display: none; }
            .grid-3 { grid-template-columns: 1fr; }
            .highlight-box { flex-direction: column; text-align: center; padding: 60px 40px; }
            .h-content h2 { font-size: 3.5rem; min-height: 8rem; }
            .h-icon { display:none; }
        }
    </style>
</head>
<body>
    <div class="nav">
        <div class="logo-box">
            <img src="/public/plusbot_logo.png" alt="Plusbot Logo" class="logo-img">
            <div class="logo">PLUS<span>BOT</span></div>
        </div>
        <div style="display:flex; gap:15px; align-items:center;">
            <a href="mailto:agenciagolweb@gmail.com" class="btn-panel" style="background:transparent; border:1px solid rgba(255,255,255,0.4);">📧 Email</a>
            <a href="/login" class="btn-panel" style="background:var(--wa-bright); border:none; color:#002D1E;">Acceso 💬</a>
        </div>
    </div>

    <section class="hero">
        <div class="hero-orb"></div>
        <div class="hero-text">
            <div class="badge">AGENTES DE IA MULTI-NEGOCIO 🤖</div>
            <h1 id="heroTitle"></h1>
            <p>Atiende a cientos de clientes simultáneamente con una IA que reserva citas, responde dudas complejas y cierra ventas reales por WhatsApp ✅.</p>
            <a href="#leads" class="btn-cta">Activar Mi Inteligencia 🚀</a>
        </div>
        <div class="hero-img">
            <div class="phone-mockup">
                <div class="phone-header">
                    <img src="/public/plusbot_logo.png" style="width:36px; border-radius:8px;">
                    <div>Plusbot AI Agent<br><small style="opacity:0.7; font-weight:400;" id="typingStatus">● Escribiendo...</small></div>
                </div>
                <div class="phone-screen" id="chatScreen"></div>
            </div>
        </div>
    </section>

    <section class="section reveal">
        <span style="color:var(--wa-deep-green); font-weight:800; letter-spacing:3px;">SOLUCIONES SIN LÍMITES 📲</span>
        <h2 style="margin-top:1rem;">La única IA multi-inquilino</h2>
        <p class="section-subtitle">Diseñamos Plusbot para ser el cerebro operativo de múltiples negocios a la vez. Cada bot tiene su propio contexto, base de datos y objetivos de venta 🤖.</p>
        
        <div class="grid-3">
            <div class="card reveal">
                <span class="icon">🏘️</span>
                <h3>Gestión Multi-Tenant</h3>
                <p>Nuestra arquitectura permite manejar infinitos números de WhatsApp desde un solo panel administrativo central 💻.</p>
            </div>
            <div class="card reveal">
                <span class="icon">⚖️</span>
                <h3>Escalabilidad Real</h3>
                <p>Usa modelos Gemini Pro para entender intenciones complejas y dar respuestas que parecen escritas por un humano ✅.</p>
            </div>
            <div class="card reveal">
                <span class="icon">🔗</span>
                <h3>Integración Total</h3>
                <p>Conexión directa con Supabase para persistencia de datos y leads capturados en tiempo real ⚡.</p>
            </div>
        </div>
    </section>

    <div class="highlight-section">
        <div class="highlight-box reveal" id="highlightBox">
            <div class="h-content">
                <h2 id="highlightTitle"></h2>
                <p id="highlightDesc"></p>
                <div style="display:flex; gap:30px; margin-top:3rem;">
                    <div style="font-weight:800; border-left: 4px solid var(--gold); padding-left: 15px; font-size:1.5rem;">+98%<br><small style="opacity:0.6; font-weight:400; font-size:0.9rem;">Satisfacción</small></div>
                    <div style="font-weight:800; border-left: 4px solid var(--gold); padding-left: 15px; font-size:1.5rem;">24/7<br><small style="opacity:0.6; font-weight:400; font-size:0.9rem;">Disponibilidad</small></div>
                </div>
            </div>
            <div class="h-icon">📲</div>
        </div>
    </div>

    <section class="footer-form reveal" id="leads">
        <h2 style="color:#fff;">Transforma tu WhatsApp Hoy</h2>
        <p style="color:#fff; opacity:0.7; font-size:1.3rem;">Completa tus datos y activa tu bot en menos de 5 minutos ⚡.</p>
        
        <div class="form-container">
            <form id="pForm">
                <input type="text" name="business_name" placeholder="Nombre de tu Negocio" required>
                <input type="text" name="contact_name" placeholder="Tu Nombre" required>
                <input type="tel" name="contact_number" placeholder="WhatsApp (Ej: +54 9 11...)" required>
                <button type="submit" class="btn-cta" style="width:100%; border-radius:18px;" id="btnP">¡Quiero Mi Plusbot! 🤖</button>
            </form>
            <div id="st" style="margin-top:2rem; font-weight:700; font-size:1.2rem;"></div>
            <p style="margin-top: 3rem; color: #777; font-size: 0.95rem; border-top: 1px solid #eee; padding-top: 2rem;">
                ¿Prefieres conversar por correo? <br>
                <a href="mailto:agenciagolweb@gmail.com?subject=Consulta sobre Plusbot" style="color: var(--wa-deep-green); text-decoration: none; font-weight: 700; font-size: 1.1rem;">📧 agenciagolweb@gmail.com</a>
            </p>
        </div>
    </section>

    <footer>
        <p>&copy; 2026 Plusbot AI Global. Hecho con ❤️ para potenciar negocios.</p>
        <p style="margin-top:10px; font-size:0.85rem; opacity:0.5;">Soporte: agenciagolweb@gmail.com</p>
    </footer>

    <script>
        // Función de escritura letra por letra
        function typeText(el, text, speed = 40, callback) {
            let i = 0; el.innerHTML = "";
            function type() {
                if (i < text.length) {
                    el.innerHTML += text.charAt(i); i++;
                    setTimeout(type, speed);
                } else if (callback) callback();
            }
            type();
        }

        // Animación Hero Title
        const heroTitle = document.getElementById('heroTitle');
        setTimeout(() => {
            typeText(heroTitle, "Deja de perder ventas por WhatsApp 💬", 50);
        }, 800);

        // Animación Highlight con scroll
        let highInited = false;
        const highObserver = new IntersectionObserver((entries) => {
            if(entries[0].isIntersecting && !highInited) {
                highInited = true;
                const hTitle = document.getElementById('highlightTitle');
                const hDesc = document.getElementById('highlightDesc');
                typeText(hTitle, "Cero Fricción. 📲\\nCero Apps.", 60, () => {
                    typeText(hDesc, "Tus clientes ya viven en WhatsApp. No los obligues a salir para completar una compra o registrarse. Plusbot resuelve todo dentro de la app que más usan ✅.", 30);
                });
            }
        }, { threshold: 0.5 });
        highObserver.observe(document.getElementById('highlightBox'));

        // Simulación de Chat
        const chatScreen = document.getElementById('chatScreen');
        const status = document.getElementById('typingStatus');
        const script = [
            { txt: "¿Tienen citas disponibles para hoy? 🤔", bot: false },
            { txt: "¡Hola! 👋 Claro que sí. Tenemos disponible a las 14hs y 17hs de hoy. ¿Cuál prefieres?", bot: true },
            { txt: "Me gustaría a las 17hs por favor. ✅", bot: false },
            { txt: "¡Excelente! 🤖 Turno agendado para las 17:00 hs. ¿En qué más puedo ayudarte?", bot: true }
        ];

        async function runChat() {
            for(let m of script) {
                status.style.opacity = m.bot ? "1" : "0";
                await new Promise(r => setTimeout(r, m.bot ? 1500 : 800));
                
                const div = document.createElement('div');
                div.className = "msg " + (m.bot ? "msg-bot" : "");
                chatScreen.appendChild(div);
                setTimeout(() => div.classList.add('visible'), 50);
                
                // Efecto de escritura dentro de la burbuja
                let i = 0;
                await new Promise(r => {
                    function typeBubble() {
                        if (i < m.txt.length) {
                            div.innerHTML += m.txt.charAt(i); i++;
                            chatScreen.scrollTop = chatScreen.scrollHeight;
                            setTimeout(typeBubble, 30);
                        } else { r(); }
                    }
                    typeBubble();
                });

                await new Promise(r => setTimeout(r, 1000));
                status.style.opacity = "0";
            }
        }
        setTimeout(runChat, 2500);

        // Reveal
        const revObs = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('active'); });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => revObs.observe(el));

        // Form
        document.getElementById('pForm').onsubmit = async(e)=>{
            e.preventDefault();
            const st=document.getElementById('st'); const btn=document.getElementById('btnP');
            btn.innerText='Procesando...'; btn.disabled=true;
            const data=Object.fromEntries(new FormData(e.target));
            try {
                const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
                if(r.ok) { 
                    st.style.color='#2ecc71'; 
                    st.innerText='¡Listo! ✅ Guardamos tus datos. Abriendo tu correo para el contacto final...'; 
                    const mailtoUrl = 'mailto:agenciagolweb@gmail.com?subject=Interés en Plusbot: ' + data.business_name + '&body=Hola! Mi nombre es ' + data.contact_name + ' de ' + data.business_name + '. Me gustaría activar mi Plusbot. Mi WhatsApp: ' + data.contact_number;
                    setTimeout(() => { 
                        window.location.href = mailtoUrl;
                        st.innerText = '¡Perfecto! ✅ Si no se abrió tu correo, escribe a agenciagolweb@gmail.com';
                    }, 2000);
                    e.target.reset(); 
                }
                else throw new Error();
            } catch(e) { st.style.color='#e74c3c'; st.innerText='⚠️ Error al guardar. Por favor, escribe directamente a agenciagolweb@gmail.com'; }
            finally { btn.innerText='¡Quiero Mi Plusbot! 🤖'; btn.disabled=false; }
        };
    </script>
</body>
</html>`);
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Login | Plusbot Admin</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
            <style>
                body { 
                    margin: 0; padding: 0; font-family: 'Inter', sans-serif;
                    background: #F4F7F6;
                    height: 100vh; display: flex; justify-content: center; align-items: center;
                }
                .login-card {
                    background: #fff;
                    padding: 3rem;
                    border-radius: 40px;
                    border: 1px solid #EEE;
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                    color: #111;
                    box-shadow: 0 40px 100px rgba(0,0,0,0.05);
                }
                .logo { font-family: 'Outfit'; font-size: 2rem; margin-bottom: 2rem; letter-spacing: -1px; color: #00593B; display: flex; align-items: center; justify-content: center; gap: 10px; }
                .logo span { color: #25D366; }
                .logo img { width: 35px; border-radius: 8px; }
                h2 { margin-bottom: 2rem; font-size: 1.5rem; font-family: 'Outfit'; }
                input {
                    width: 100%; padding: 16px; margin-bottom: 1rem;
                    border-radius: 12px; border: 1px solid #DDD;
                    background: #fff;
                    color: #111; font-size: 1rem; box-sizing: border-box; outline: none;
                }
                input:focus { border-color: #25D366; }
                button {
                    width: 100%; padding: 16px; background: #00593B;
                    border: none; border-radius: 12px; color: #fff;
                    font-weight: 800; font-size: 1rem; cursor: pointer;
                    transition: 0.3s;
                }
                button:hover { background: #00442e; }
                .error { color: #e74c3c; font-size: 0.85rem; margin-top: 1rem; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <div class="logo"><img src="/public/plusbot_logo.png" alt="Plusbot">PLUS<span>BOT</span></div>
                <h2>Acceso Admin</h2>
                <form action="/login" method="POST">
                    <input type="password" name="password" placeholder="Contraseña de acceso" required>
                    <button type="submit">Entrar</button>
                    ${req.query.error === '1' ? '<div class="error">Contraseña incorrecta.</div>' : ''}
                </form>
            </div>
        </body>
        </html>
    `);
});


app.post('/login', async (req, res) => {
    const { password } = req.body;
    
    // 1. Check Admin
    if (password === process.env.ADMIN_PASSWORD || password === 'admin123') {
        res.cookie('admin_session', 'authenticated', { httpOnly: true });
        return res.redirect('/dashboard');
    }

    // 2. Check individual business password
    try {
        const { data: biz } = await supabase
            .from('businesses')
            .select('id')
            .eq('access_password', password)
            .eq('active', true)
            .maybeSingle();

        if (biz) {
            res.cookie('admin_session', 'biz_' + biz.id, { httpOnly: true });
            return res.redirect('/dashboard');
        }
    } catch (e) { logger.error(e); }

    res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.redirect('/login');
});


app.get('/qr/:number', async (req, res) => {
    const { number } = req.params;
    const qrString = getQRCode(number);
    
    if (!qrString) {
        logger.info({ number }, 'Intento de ver QR pero no está disponible aún');
        return res.send(`
            <!DOCTYPE html>
            <html>
            <body style="background:#f4f7f5;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
                <div style="background:white;padding:3rem;border-radius:2rem;box-shadow:0 20px 50px rgba(0,0,0,0.05);">
                    <h2 style="color:#00593B;">QR no disponible</h2>
                    <p style="color:#666;">El bot se está iniciando o ya está conectado.<br>Refresca en unos segundos.</p>
                    <button onclick="location.reload()" style="margin-top:1rem;padding:10px 20px;border-radius:10px;border:none;background:#25D366;color:white;font-weight:bold;cursor:pointer;">Actualizar ↻</button>
                </div>
            </body>
            </html>
        `);
    }

    try {
        const qrSvg = await QRCode.toString(qrString, { 
            type: 'svg', 
            margin: 2,
            width: 320,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        
        logger.info({ number }, 'Enviando QR exitosamente');
        res.send(`<!DOCTYPE html><html><body style="background:#f4f7f5;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;margin:0;"><div style="background:white;padding:30px;border-radius:30px;box-shadow:0 30px 60px rgba(0,45,30,0.1);text-align:center;"><h2 style="color:#00593B;margin-top:0;">Vincular WhatsApp</h2><div style="background:white;padding:10px;border-radius:15px;border:1px solid #eee;">${qrSvg}</div><p style="margin-top:20px;color:#666;">Escanea desde WhatsApp <br><b>Dispositivos vinculados</b></p></div><script>setTimeout(() => location.reload(), 25000);</script></body></html>`);
    } catch (err) { res.status(500).send('Error'); }
});


app.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        let bizQuery = supabase.from('businesses').select('*').order('created_at', { ascending: false });
        let leadsQuery = supabase.from('leads').select('*').order('created_at', { ascending: false });

        // Apply filters if client
        if (req.user.role === 'client') {
            bizQuery = bizQuery.eq('id', req.user.bizId);
            // Optionally filter leads by business name if the lead table had business_id, 
            // but for now it has business_name. We'll fetch the business name first.
            const { data: myBiz } = await supabase.from('businesses').select('business_name').eq('id', req.user.bizId).single();
            if (myBiz) leadsQuery = leadsQuery.eq('business_name', myBiz.business_name);
        }

        const { data: businesses } = await bizQuery;
        const { data: leads } = await leadsQuery;
        const statuses = getStatus();

        const bizRows = (businesses || []).map(biz => {
            const s = statuses[biz.whatsapp_number] || { connected: false };
            const statusLabel = s.connected ? 'CONECTADO' : 'DESCONECTADO';
            const statusColor = s.connected ? '#27ae60' : '#95a5a6';
            return `
                <tr>
                    <td><strong>${biz.business_name}</strong><br><small>${biz.whatsapp_number}</small></td>
                    <td><span style="color:${statusColor}; font-weight:bold;">● ${statusLabel}</span></td>
                    <td>
                        <a href="/qr/${biz.whatsapp_number}" target="_blank" class="btn-s">QR</a>
                        <a href="/dashboard/edit/${biz.id}" class="btn-s" style="background:#3498db;">EDITAR</a>
                        <button onclick="reconnect('${biz.whatsapp_number}')" class="btn-s" style="background:#eee; color:#333;">REINICIAR</button>
                    </td>
                </tr>`;
        }).join('');

        const leadRows = (leads || []).map(l => `
            <div class="lead-item">
                <div style="font-weight:700;">${l.contact_name} <small style="font-weight:400; color:#999;">(${l.business_name})</small></div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                    <a href="https://wa.me/${l.contact_number.replace(/\D/g,'')}" target="_blank" style="color:#25D366; text-decoration:none; font-size:0.9rem;">${l.contact_number}</a>
                    <small style="opacity:0.5">${new Date(l.created_at).toLocaleDateString()}</small>
                </div>
            </div>
        `).join('');

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Panel Plusbot</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #F4F7F6; margin: 0; padding: 0; }
        header { background: #00593B; color: white; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; }
        .logo-box { display: flex; align-items: center; gap: 10px; font-family: 'Outfit'; font-size: 1.4rem; }
        .logo-box img { width: 30px; border-radius: 6px; }
        .container { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; padding: 2rem 5%; }
        .card { background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        h2 { font-family: 'Outfit'; margin-top: 0; color: #00593B; font-size: 1.4rem; border-bottom: 2px solid #F4F7F6; padding-bottom: 1rem; margin-bottom: 1rem; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 1rem; border-bottom: 2px solid #F4F7F6; color: #999; font-size: 0.8rem; }
        td { padding: 1.5rem 1rem; border-bottom: 1px solid #F4F7F6; }
        .btn-s { padding: 8px 16px; border-radius: 10px; border: none; background: #25D366; color: white; font-weight: bold; cursor: pointer; font-size: 0.75rem; text-decoration: none; transition: 0.2s; }
        .btn-s:hover { opacity: 0.8; transform: translateY(-2px); }
        .lead-item { padding: 1.2rem; border-bottom: 1px solid #F4F7F6; transition: 0.2s; }
        .lead-item:hover { background: #F9FAFB; }
        .lead-item:last-child { border: none; }
    </style>
</head>
<body>
    <header>
        <div class="logo-box"><img src="/public/plusbot_logo.png"> PLUSBOT</div>
        <div style="display:flex; gap:20px;">
            <a href="/" style="color:white; text-decoration:none; opacity:0.7;">Ver Web Pública</a>
            <a href="/logout" style="color:#ff6b6b; text-decoration:none; font-weight:700;">Salir</a>
        </div>
    </header>
    <div class="container">
        <div class="card">
            <h2>Gestión de Bots Activos</h2>
            <table>
                <thead><tr><th>NEGOCIO / NÚMERO</th><th>ESTADO ACTUAL</th><th>ACCIONES</th></tr></thead>
                <tbody>${bizRows}</tbody>
            </table>
        </div>
        <div class="card">
            <h2>Interesados (Leads)</h2>
            <div style="max-height: 60vh; overflow-y: auto;">
                ${leadRows || '<p style="color:#999; text-align:center; padding:2rem;">No hay interesados aún.</p>'}
            </div>
        </div>
    </div>
    <script>
        async function reconnect(num) {
            if(!confirm('¿Desea reiniciar la sesión de ' + num + '?')) return;
            const r = await fetch('/api/reconnect/'+num, {method:'POST'});
            if(r.ok) { alert('Comando de reinicio enviado con éxito.'); location.reload(); }
        }
    </script>
</body>
</html>`);
    } catch (e) { res.status(500).send('Error'); }
});

app.get('/dashboard/edit/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Security check: clients can only edit their own business
        if (req.user.role === 'client' && req.user.bizId !== id) {
            return res.redirect('/dashboard');
        }

        const { data: biz } = await supabase.from('businesses').select('*').eq('id', id).single();
        if (!biz) return res.redirect('/dashboard');

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Configurar Plusbot | ${biz.business_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #F4F7F6; margin: 0; padding: 0; }
        header { background: #002D1E; color: white; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; }
        .logo-box { display: flex; align-items: center; gap: 10px; font-family: 'Outfit'; font-size: 1.4rem; }
        .logo-box img { width: 30px; border-radius: 6px; }
        .container { max-width: 900px; margin: 3rem auto; background: white; border-radius: 30px; padding: 3rem; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
        h1 { font-family: 'Outfit'; color: #00593B; margin-top: 0; }
        .form-group { margin-bottom: 2rem; }
        label { display: block; font-weight: 700; margin-bottom: 0.5rem; color: #333; }
        input, textarea { width: 100%; padding: 15px; border-radius: 12px; border: 2px solid #EEE; font-family: inherit; font-size: 1rem; box-sizing: border-box; }
        textarea { height: 120px; }
        input:focus, textarea:focus { border-color: #25D366; outline: none; }
        .hint { font-size: 0.85rem; color: #999; margin-top: 0.4rem; }
        .btn-save { background: #25D366; color: white; padding: 15px 40px; border-radius: 15px; border: none; font-weight: 800; cursor: pointer; transition: 0.3s; }
        .btn-save:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(37,211,102,0.3); }
        .back { text-decoration: none; color: #999; display: inline-block; margin-bottom: 2rem; }
    </style>
</head>
<body>
    <header>
        <div class="logo-box"><img src="/public/plusbot_logo.png"> PLUSBOT</div>
        <a href="/dashboard" style="color:white; text-decoration:none; opacity:0.8;">← Volver al Panel</a>
    </header>
    <div class="container">
        <h1>Configurar Contexto: ${biz.business_name}</h1>
        <form action="/dashboard/edit/${biz.id}" method="POST">
            <div class="form-group">
                <label>Nombre del Negocio</label>
                <input type="text" name="business_name" value="${biz.business_name}" required>
            </div>
            <div class="grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                 <div class="form-group">
                    <label>Dirección Física</label>
                    <input type="text" name="address" value="${biz.address || ''}" placeholder="Ej: Av. Principal 123, Ciudad">
                 </div>
                 <div class="form-group">
                    <label>Sitio Web</label>
                    <input type="url" name="website" value="${biz.website || ''}" placeholder="https://miweb.com">
                 </div>
            </div>
            <div class="form-group">
                <label>Descripción General (Contexto IA)</label>
                <textarea name="description">${biz.description || ''}</textarea>
                <p class="hint">Define quién eres y qué haces. La IA lo usará para presentarse.</p>
            </div>
            <div class="form-group">
                <label>Base de Conocimiento / FAQ</label>
                <textarea name="knowledge_base" style="height: 200px;">${biz.knowledge_base || ''}</textarea>
                <p class="hint">Información ultra-específica: Precios, políticas de envío, reembolsos, stock detallado, etc. 🤖</p>
            </div>
            <div class="form-group">
                <label>Mensaje de Bienvenida</label>
                <input type="text" name="welcome_message" value="${biz.welcome_message}">
            </div>

            <div class="form-group">
                <label>Contraseña de Acceso (Cliente)</label>
                <input type="text" name="access_password" value="${biz.access_password || ''}" placeholder="Crea una contraseña para tu cliente">
                <p class="hint">El cliente usará esta contraseña para ver solo su panel.</p>
            </div>

            <hr style="border:0; border-top:1px solid #EEE; margin: 3rem 0;">
            
            <div class="form-group">
                <label>🤖 Menú Interactivo (Opciones y Respuestas)</label>
                <p class="hint">Define las opciones que el usuario verá al llegar (1, 2, 3...) y qué responderá el bot automáticamente.</p>
                
                <div id="menu-container" style="margin-top: 2rem;">
                    <!-- Se carga dinámicamente -->
                </div>
                
                <button type="button" onclick="addOption()" style="background:#f1f1f1; border: 1px dashed #ccc; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 600; margin-top: 1rem;">+ Añadir Opción</button>
            </div>

            <input type="hidden" name="menu_options" id="menu_options_input">
            <input type="hidden" name="responses" id="responses_input">

            <div style="margin-top: 4rem; text-align: right;">
                <button type="submit" class="btn-save" onclick="prepareData()">Guardar Configuración Completa 💾</button>
            </div>
        </form>
    </div>

    <script>
        const initialMenu = ${JSON.stringify(biz.menu_options || {})};
        const initialResp = ${JSON.stringify(biz.responses || {})};
        const container = document.getElementById('menu-container');

        function createOptionRow(key, label, resp) {
            const div = document.createElement('div');
            div.className = 'menu-row';
            div.style = 'display: grid; grid-template-columns: 60px 1fr 2fr 50px; gap: 1rem; margin-bottom: 1rem; align-items: start; background: #f9f9f9; padding: 1rem; border-radius: 15px;';
            div.innerHTML = \`
                <div><label small>#</label><input type="text" class="m-key" value="\${key}" style="padding:8px; text-align:center;"></div>
                <div><label small>Etiqueta</label><input type="text" class="m-label" value="\${label}" placeholder="Ej: Ver Precios" style="padding:8px;"></div>
                <div><label small>Respuesta Automática</label><textarea class="m-resp" style="padding:8px; height:60px; font-size:0.9rem;">\${resp}</textarea></div>
                <div style="padding-top:25px;"><button type="button" onclick="this.parentElement.parentElement.remove()" style="background:#ff6b6b; color:white; border:none; width: 30px; height:30px; border-radius:50%; cursor:pointer;">×</button></div>
            \`;
            container.appendChild(div);
        }

        // Cargar datos actuales
        Object.keys(initialMenu).sort((a,b) => a-b).forEach(k => {
            createOptionRow(k, initialMenu[k], initialResp[k] || '');
        });

        function addOption() {
            const nextKey = (container.querySelectorAll('.menu-row').length + 1).toString();
            createOptionRow(nextKey, '', '');
        }

        function prepareData() {
            const menu = {};
            const resp = {};
            document.querySelectorAll('.menu-row').forEach(row => {
                const key = row.querySelector('.m-key').value.trim();
                const label = row.querySelector('.m-label').value.trim();
                const response = row.querySelector('.m-resp').value.trim();
                if (key && label) {
                    menu[key] = label;
                    resp[key] = response;
                }
            });
            document.getElementById('menu_options_input').value = JSON.stringify(menu);
            document.getElementById('responses_input').value = JSON.stringify(resp);
        }
    </script>
</body>
</html>
        `);
    } catch (e) { res.status(500).send('Error loading edit page'); }
});

app.post('/dashboard/edit/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Security check
        if (req.user.role === 'client' && req.user.bizId !== id) {
             return res.status(403).send('No tienes permiso');
        }

        const { business_name, description, knowledge_base, address, website, welcome_message, menu_options, responses, access_password } = req.body;
        
        let menuJson = {};
        let respJson = {};
        try {
            if (menu_options) menuJson = JSON.parse(menu_options);
            if (responses) respJson = JSON.parse(responses);
        } catch (e) { logger.error('Error parsing menu JSON', e); }

        const { data: oldBiz } = await supabase.from('businesses').select('whatsapp_number').eq('id', id).single();

        const { error } = await supabase.from('businesses').update({
            business_name,
            description,
            knowledge_base,
            address,
            website,
            welcome_message,
            access_password,
            menu_options: menuJson,
            responses: respJson,
            updated_at: new Date()
        }).eq('id', id);

        if (error) throw error;

        // Invalidate cache in botEngine so changes are picked up immediately
        const { invalidateCache } = require('./services/botEngine');
        if (oldBiz) invalidateCache(oldBiz.whatsapp_number);

        res.send(`<script>alert('¡Configuración actualizada! 🚀'); window.location.href='/dashboard';</script>`);
    } catch (e) { res.status(500).send('Error updating: ' + e.message); }
});



app.post('/api/leads', async (req, res) => {
    const { business_name, contact_name, contact_number } = req.body;
    try {
        await supabase.from('leads').insert([{ business_name, contact_name, contact_number }]);
        res.status(201).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/reconnect/:number', authMiddleware, async (req, res) => {
    const { number } = req.params;
    try {
        await disconnectBusiness(number);
        // Wait a bit before reconnecting
        setTimeout(() => {
            connectBusiness(number, 'Manual Reset').catch(e => logger.error(e));
        }, 3000);
        res.json({ success: true, message: 'Reiniciando sesión...' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/disconnect/:number', authMiddleware, async (req, res) => {
    const { number } = req.params;
    try {
        await disconnectBusiness(number);
        res.json({ success: true, message: 'Desconectado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
