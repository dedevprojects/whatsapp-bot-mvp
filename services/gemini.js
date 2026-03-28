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
 * @param {object} params
 * @param {string} params.text - The user message text
 * @param {object} params.business - Business info to provide context to the AI
 * @param {Array<{role: string, text: string}>} params.history - Recent conversation history
 * @param {Buffer} params.mediaBuffer - Optional media data (audio, image, document)
 * @param {string} params.mimeType - Optional media mime type
 * @returns {Promise<string>}
 */
async function getChatResponse({ text, senderName, business, history = [], mediaBuffer = null, mimeType = null }) {
    const ai = getGenAI();
    if (!ai) {
        logger.warn('GEMINI_API_KEY not configured. Falling back to empty response.');
        return '';
    }

    try {
        const systemInstruction = `
Eres un asistente virtual avanzado, PROACTIVO y con una misión clara: ayudar al cliente de la empresa "${business.business_name}" a resolver sus dudas y, sobre todo, a cerrar reservas o ventas.
El usuario se llama ${senderName || 'Cliente'}. Dirígete a él de forma cordial pero resolutiva.

INFORMACIÓN DEL NEGOCIO (Contexto Estricto):
- Nombre: ${business.business_name}
- Descripción: ${business.description || 'Sin descripción detallada.'}
- Dirección: ${business.address || 'Consultar por chat.'}
- Sitio Web: ${business.website || 'No disponible.'}
- Base de Conocimientos: ${business.knowledge_base || 'Sin detalles extra.'}

TU ADN COMO ASISTENTE:
1. NO TE QUEDES CALLADO. Si el usuario te da información parcial (como un día y hora), búscalos en tu contexto y CONFIRMA el turno siguiendo las REGLAS CRÍTICAS DE RESPUESTA de la base de conocimiento (el formato '¡Genial! Turno agendado...').
2. USA EL SENTIDO COMÚN. Si te piden algo lógico dentro del negocio (precios, horarios), dalo con seguridad si está en el contexto. Si no está, no inventes, pero ofrece alternativas.
3. CONVERSA NATURALMENTE. Eres la voz de una empresa profesional, pero no robotizada. Usa emojis (pocos y bien puestos) para ser empático.
4. BASATE EN EL CONTEXTO. Todo lo que necesitas saber está en la 'Base de Conocimientos'. Léela bien. Si allí dice precios u opciones del menú, úsalas.
5. SÉ CONCISO. Evita textos largos. Los mensajes de WhatsApp deben ser fáciles de leer.
`;
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Format history for Gemini
        let contents = [];
        
        for (const msg of history) {
            if (!msg.text) continue;
            const mappedRole = msg.role === 'inbound' ? 'user' : 'model';
            
            const lastMsg = contents[contents.length - 1];
            if (lastMsg && lastMsg.role === mappedRole) {
                lastMsg.parts[0].text += `\n${msg.text}`;
            } else {
                contents.push({
                    role: mappedRole,
                    parts: [{ text: msg.text }]
                });
            }
        }

        const currentText = (text || "Analiza el archivo adjunto o continúa la conversación.").trim();
        const userPrompt = `[System Instruction]:\n${systemInstruction}\n\n[Mensaje del Usuario]: ${currentText}`;
        const lastInHistory = contents[contents.length - 1];

        if (lastInHistory && lastInHistory.role === 'user') {
            lastInHistory.parts[0].text += `\n\n${userPrompt}`;
        } else {
            contents.push({
                role: 'user',
                parts: [{ text: userPrompt }]
            });
        }

        // Final safety check: if still empty (shouldn't happen) or starting with model
        while (contents.length > 0 && contents[0].role === 'model') {
            contents.shift();
        }

        logger.info({ 
            business: business.business_name, 
            hasMedia: !!mediaBuffer,
            mimeType,
            mediaSize: mediaBuffer?.length 
        }, 'Calling Gemini API (Multimodal)');

        const result = await model.generateContent({ contents });
        const responseText = result.response.text();

        if (!responseText) {
            throw new Error('Gemini returned an empty response');
        }

        return responseText;
    } catch (error) {
        logger.error({ error: error.message }, 'Error calling Gemini API');
        return 'Lo siento, tuve un pequeño problema procesando tu mensaje. Un humano te contactará pronto.';
    }
}

module.exports = { getChatResponse };
