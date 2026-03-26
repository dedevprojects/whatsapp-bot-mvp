require('dotenv').config();
const { getChatResponse } = require('./services/gemini');

async function main() {
    try {
        const business = { business_name: 'Test Business', description: 'Test description' };
        
        // Simulate a history where the first message was the user, followed by the bot's menu
        const history = [
            { role: 'inbound', text: 'Hola' },
            { role: 'outbound', text: 'Bienvenido! 1. Ver menu\n2. Horarios\n3. Ubicacion' }
        ];
        
        console.log("Intentando llamar a Gemini con el historial simulado...");
        
        const res = await getChatResponse('Dime los horarios por favor', business, history);
        
        console.log("\n=====================\n[Resultado de la API]:", res);
    } catch (err) {
        console.error("Error fatal localizando la falla:", err);
    }
}

main();
