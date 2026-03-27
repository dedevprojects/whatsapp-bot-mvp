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
async function getChatResponse({ text, business, history = [], mediaBuffer = null, mimeType = null }) {
    const ai = getGenAI();
    if (!ai) {
        logger.warn('GEMINI_API_KEY not configured. Falling back to empty response.');
        return '';
    }

    try {
        const systemInstruction = `
Eres un asistente virtual para la empresa "${business.business_name}".
Tu objetivo es ser amable, servicial y profesional.

Información de la empresa:
- Nombre: ${business.business_name}
- Descripción: ${business.description || 'Nuestra empresa se enfoca en dar el mejor servicio.'}
- Dirección: ${business.address || 'Consultar por este chat'}
- Sitio Web: ${business.website || 'No disponible'}
- Email de Soporte/Ventas: agenciagolweb@gmail.com
- Conocimiento Específico: ${business.knowledge_base || ''}

Pautas:
- Responde de forma concisa.
- Usa emoticonos de vez en cuando para sonar amigable.
- Si un usuario está interesado en contratar el servicio o necesita soporte técnico avanzado, indícale que puede escribir a agenciagolweb@gmail.com.
- Si no sabes algo, pide al usuario que aguarde un momento para que un humano lo asista.
- No inventes precios o servicios que no estén mencionados en la descripción o conocimiento específico.
- El usuario habla por WhatsApp, así que sé directo.
- IMPORTANTE: Tienes acceso al historial reciente de la conversación para entender el contexto.
- Tu respuesta debe ser natural, como si fueras un humano atendiendo el negocio.
`;

        // Initialize model with system instruction (Optimized for Gemini 1.5 Pro/Flash)
        const model = ai.getGenerativeModel({ 
            model: "gemini-flash-latest",
            systemInstruction: systemInstruction 
        });

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

        const currentText = text || "Analiza el archivo adjunto o continúa la conversación.";
        const lastInHistory = contents[contents.length - 1];

        // Ensure strictly alternating roles. If history ends with 'user', append to it.
        if (lastInHistory && lastInHistory.role === 'user') {
            lastInHistory.parts[0].text += `\n\n[Mensaje Actual]: ${currentText}`;
            if (mediaBuffer) {
                const cleanMimeType = (mimeType || 'image/jpeg').split(';')[0].trim();
                lastInHistory.parts.push({
                    inlineData: {
                        data: mediaBuffer.toString('base64'),
                        mimeType: cleanMimeType
                    }
                });
            }
        } else {
            // Otherwise, add a new 'user' message
            const userParts = [{ text: currentText }];
            if (mediaBuffer) {
                const cleanMimeType = (mimeType || 'image/jpeg').split(';')[0].trim();
                userParts.push({
                    inlineData: {
                        data: mediaBuffer.toString('base64'),
                        mimeType: cleanMimeType
                    }
                });
            }
            contents.push({
                role: 'user',
                parts: userParts
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
