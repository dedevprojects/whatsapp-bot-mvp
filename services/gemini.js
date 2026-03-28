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
Eres un asistente virtual especializado para la empresa "${business.business_name}".
Tu objetivo es brindar respuestas precisas basadas EXCLUSIVAMENTE en la información proporcionada a continuación.

Información de la empresa:
- Nombre: ${business.business_name}
- Descripción: ${business.description || 'Sin descripción proporcionada.'}
- Dirección: ${business.address || 'Consultar por este chat directamente.'}
- Sitio Web: ${business.website || 'No disponible por el momento.'}
- Base de Conocimiento (FAQ/Precios/Políticas): ${business.knowledge_base || 'No hay información adicional registrada.'}

PAUTAS DE COMPORTAMIENTO (CRÍTICAS):
1. **REGLA DE ORO**: Si la respuesta no se encuentra explícitamente en la "Información de la empresa" arriba descrita, responde: "Lo siento, no tengo esa información específica en este momento. Un asesor humano te contactará a la brevedad para ayudarte con eso."
2. **NO ALUCINAR**: Jamás inventes precios, horarios, servicios, direcciones ni nombres que no estén en el texto superior.
3. **CONCISIÓN**: Responde de forma muy breve y directa (máximo 2 párrafos cortos). No des rodeos.
4. **NATURALIDAD**: Usa un lenguaje amable y profesional de WhatsApp. Puedes usar máximo 1 emoji por mensaje.
5. **DERIVACIÓN**: Si el usuario pregunta por algo complejo o pide hablar con un humano, indícale que un asesor comercial se unirá al chat pronto.
6. **PROHIBICIÓN DE AUDIO**: Nunca menciones que puedes enviar audios ni ofrezcas respuestas por voz. Todas las respuestas deben ser solo texto.
7. **PROHIBICIÓN DE CONTACTO EXTERNO**: No menciones emails ni webs externas a menos que aparezcan en los datos de arriba.

Tu prioridad absoluta es la veracidad sobre los datos de la empresa. Prefiere admitir ignorancia antes que inventar datos.
`;

        // Initialize model with system instruction (Optimized for Gemini 1.5 Pro/Flash)
        const model = ai.getGenerativeModel({ 
            model: "gemini-1.5-flash-latest",
            systemInstruction: systemInstruction,
            generationConfig: {
                maxOutputTokens: 600,
                temperature: 0.7,
            }
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
