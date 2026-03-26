require('dotenv').config();
const supabase = require('./config/supabase');

const demos = [
    {
        business_name: 'Roma Pasta 🍝',
        description: 'Auténtico restaurante italiano especializado en pastas caseras, lasaña y vinos importados. Ambiente familiar y acogedor.',
        whatsapp_number: '+5491100000001',
        welcome_message: '¡Hola! Bienvenido a Roma Pasta 🍝',
        menu_options: {
            "1": "🍽️ Ver Menú del día",
            "2": "🍷 Carta de Vinos",
            "3": "📅 Reservar Mesa",
            "4": "📍 Ubicación y Horarios"
        },
        responses: {
            "1": "Hoy tenemos: Lasaña Bolognesa, Ñoquis con estofado y Ravioles de espinaca. ¿Cuál te tienta? 😉",
            "2": "Nuestra especialidad es el Malbec de la casa y el Chianti reserva.",
            "3": "¡Perfecto! Decime para cuántas personas y en qué horario te gustaría venir.",
            "4": "Estamos en Av. Italia 456. Abrimos de Martes a Domingo de 12:00 a 23:30."
        }
    },
    {
        business_name: 'Titan Gym 🏋️‍♂️',
        description: 'Gimnasio de alto rendimiento con máquinas de última generación, clases de CrossFit, Yoga y nutrición deportiva.',
        whatsapp_number: '+5491100000002',
        welcome_message: '¡Hola guerrero! Bienvenido a Titan Gym 🏋️‍♂️ ¿Listo para entrenar?',
        menu_options: {
            "1": "💪 Planes y Precios",
            "2": "🕒 Horarios de Clases",
            "3": "🥑 Consulta Nutricional",
            "4": "🏃 Coach Personalizado"
        },
        responses: {
            "1": "Plan Mensual: $5000 | Plan Trimestral: $13500 | Plan Anual: $45000 (¡25% OFF!)",
            "2": "CrossFit: 8h y 19h | Yoga: 10h | Musculación: Abierto de 7h a 22h.",
            "3": "Nuestros nutricionistas están los Lunes y Miércoles de 16h a 20h. ¿Querés un turno?",
            "4": "Te asignaremos un coach para armar tu rutina según tus objetivos."
        }
    },
    {
        business_name: 'Lotus Spa & Estética 🌸',
        description: 'Centro de bienestar integral. Ofrecemos masajes relajantes, limpieza facial profunda, manicuría y tratamientos corporales.',
        whatsapp_number: '+5491100000003',
        welcome_message: 'Bienvenida a Lotus Spa 🌸 Un espacio diseñado para tu relax.',
        menu_options: {
            "1": "💆 Masajes y Relax",
            "2": "✨ Tratamientos Faciales",
            "3": "💅 Manicuría y Pedicuría",
            "4": "🎁 Gift Cards"
        },
        responses: {
            "1": "Masaje descontracturante (1h): $3500 | Piedras calientes: $4200.",
            "2": "Limpieza profunda: $2800 | Peeling diamante: $3500.",
            "3": "Esmaltado semipermanente: $1500 | Esculpidas: $2500.",
            "4": "¡Regalá bienestar! Tenemos vouchers desde $2000. ¿Para quién es el regalo?"
        }
    },
    {
        business_name: 'Altos del Sur 🏠 (Inmobiliaria)',
        description: 'Venta y alquiler de departamentos, casas y terrenos. Tasaciones sin cargo y asesoramiento jurídico.',
        whatsapp_number: '+5491100000004',
        welcome_message: '¡Hola! Bienvenido a Inmobiliaria Altos del Sur 🏠 ¿Cómo podemos ayudarte hoy?',
        menu_options: {
            "1": "🏠 Ver Alquileres",
            "2": "🔝 Propiedades en Venta",
            "3": "📈 Tasación s/cargo",
            "4": "📄 Documentación necesaria"
        },
        responses: {
            "1": "Dejanos tu presupuesto aproximado y zona de interés (ej: Palermo, Centro) y te enviamos opciones.",
            "2": "Nuevas unidades en preventa en Barrio Norte desde USD 85.000.",
            "3": "¡Perfecto! Te asignamos un tasador profesional hoy mismo. ¿Qué dirección evaluamos?",
            "4": "Garantía propietaria (CABA/Zona Norte) y demostración de ingresos (3 últimos recibos)."
        }
    }
];

async function seed() {
    console.log('--- Seeding Demos ---');
    for (const demo of demos) {
        console.log(`Inserting ${demo.business_name}...`);
        const { error } = await supabase
            .from('businesses')
            .upsert(demo, { onConflict: 'whatsapp_number' });

        if (error) {
            console.error(`Error seed ${demo.business_name}:`, error.message);
        } else {
            console.log(`✅ ${demo.business_name} seeded successfully.`);
        }
    }
    console.log('--- Done ---');
}

seed();
