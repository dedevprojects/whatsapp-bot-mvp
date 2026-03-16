'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;

function getGenAI() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your-gemini-api-key-here') {
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
        logger.warn('GEMINI_API_KEY not configured or invalid. Falling back to empty response.');
        return '';
    }

    try {
        const model = ai.getGenerativeModel({ model: "gemini-flash-latest" });

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

        // Format history for Gemini
        const contents = history.map(msg => ({
            role: msg.role === 'inbound' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Add the current user message
        contents.push({
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nPregunta actual: ${prompt}` }]
        });

        const result = await model.generateContent({ contents });

        const response = result.response;
        return response.text();
    } catch (error) {
        logger.error({ error }, 'Error calling Gemini API');
        return 'Lo siento, tuve un pequeño problema procesando tu mensaje. Un humano te contactará pronto.';
    }
}

module.exports = { getChatResponse };
