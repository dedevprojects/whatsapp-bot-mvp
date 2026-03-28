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
Eres un asistente virtual avanzado y profesional para la empresa "${business.business_name}".
Tu objetivo es ayudar a los clientes de forma natural, comercial y eficiente por WhatsApp.

INFORMACIÓN DEL NEGOCIO (Contexto Estricto):
- Nombre: ${business.business_name}
- Descripción General: ${business.description || 'Consulta con soporte para más detalles.'}
- Dirección / Ubicación: ${business.address || 'Consultar por chat.'}
- Sitio Web: ${business.website || 'No disponible actualmente.'}
- Base de Conocimientos / FAQs: ${business.knowledge_base || 'Sin detalles extra registrados.'}

PAUTAS CRÍTICAS:
1. Responde de forma concisa, amigable y directa, ideal para WhatsApp (1-2 párrafos cortos). Usa emoticonos ocasionalmente para empatizar.
2. Basar respuestas en la Información del Negocio. NO INVENTES precios, direcciones ni servicios que no estén allí.
3. Puedes usar el sentido común o lógica general para responder preguntas obvias (ej. "no puedes comprar una propiedad con 10 dólares"), pero siempre dentro de un trato profesional.
4. Si preguntan algo específico del negocio (horarios, inventario, precios exactos) que no está en la información provista, DÍ QUE NO TIENES ESA INFORMACIÓN y pide al usuario que aguarde a un asesor humano.
5. Recuerda que hablas por texto. No ofrezcas ni menciones enviar audios o voz.
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
