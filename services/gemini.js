'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;

function getGenAI() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your-gemini-api-key-here') {
            logger.error('GEMINI_API_KEY is not configured or has placeholder value');
            return null;
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

/**
 * Generates a response using Google Gemini.
 * 
 * @param {string} prompt - The user message
 * @param {object} business - Business info to provide context to the AI
 * @param {Array<{role: string, text: string}>} history - Recent conversation history
 * @returns {Promise<string>}
 */
async function getChatResponse(prompt, business, history = []) {
    const ai = getGenAI();
    if (!ai) {
        logger.warn('GEMINI_API_KEY not configured. Falling back to empty response.');
        return '';
    }

    try {
        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const systemInstruction = `
Eres un asistente virtual para la empresa "${business.business_name}".
Tu objetivo es ser amable, servicial y profesional.

Información de la empresa:
- Nombre: ${business.business_name}
- Descripción: ${business.description || 'Consulta con soporte para más detalles'}

Pautas:
- Responde de forma concisa.
- Usa emoticonos de vez en cuando para sonar amigable.
- Si no sabes algo, pide al usuario que aguarde un momento para que un humano lo asista.
- No inventes precios o servicios que no estén mencionados.
- El usuario habla por WhatsApp, así que sé directo.
- IMPORTANTE: Tienes acceso al historial reciente de la conversación para entender el contexto.
`;

        // Format history for Gemini, ensuring strictly alternating roles
        let contents = [];
        
        for (const msg of history) {
            if (!msg.text) continue;
            const mappedRole = msg.role === 'inbound' ? 'user' : 'model';
            
            const lastMsg = contents[contents.length - 1];
            if (lastMsg && lastMsg.role === mappedRole) {
                // Merge consecutive messages with the same role
                lastMsg.parts[0].text += `\n${msg.text}`;
            } else {
                contents.push({
                    role: mappedRole,
                    parts: [{ text: msg.text }]
                });
            }
        }

        // Prevent duplication: if the prompt is already at the end of the history
        const lastMsg = contents[contents.length - 1];
        if (lastMsg && lastMsg.role === 'user' && lastMsg.parts[0].text.includes(prompt.trim('\n '))) {
            contents.pop();
        }

        // Add the current user message with system instruction
        const promptWithContext = `${systemInstruction}\n\nPregunta actual: ${prompt}`;
        const finalLastMsg = contents[contents.length - 1];
        
        if (finalLastMsg && finalLastMsg.role === 'user') {
            finalLastMsg.parts[0].text += `\n${promptWithContext}`;
        } else {
            contents.push({
                role: 'user',
                parts: [{ text: promptWithContext }]
            });
        }

        // IMPORTANT: Gemini strictly requires the conversation strictly starts with 'user'
        while (contents.length > 0 && contents[0].role === 'model') {
            contents.shift();
        }

        logger.info({ business: business.business_name }, 'Calling Gemini API for response');
        const result = await model.generateContent({ contents });
        const text = result.response.text();

        if (!text) {
            throw new Error('Gemini returned an empty response');
        }

        return text;
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error calling Gemini API');
        return 'Lo siento, tuve un pequeño problema procesando tu mensaje. Un humano te contactará pronto.';
    }
}

module.exports = { getChatResponse };
