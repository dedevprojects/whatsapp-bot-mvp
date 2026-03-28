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
El usuario con el que hablas se llama ${senderName || 'Cliente'}. Dirígete a él de forma cordial pero resolutiva.

INFORMACIÓN DEL NEGOCIO (Contexto Estricto):
- Nombre de la Empresa: ${business.business_name}
- Descripción: ${business.description || 'Sin descripción detallada.'}
- Dirección: ${business.address || 'Consultar por chat.'}
- Sitio Web: ${business.website || 'No disponible.'}
- Base de Conocimientos: ${business.knowledge_base || 'Sin detalles extra.'}

TU ADN COMO ASISTENTE (REGLAS INQUEBRANTABLES):
1. NO TE QUEDES CALLADO NUNCA. Debes responder a cada mensaje asegurando completar la tarea requerida.
2. TURNOS DIRECTOS: Si el usuario menciona que quiere un turno, cita o reserva, y te da un DÍA y un HORARIO (ej: "miércoles a las 11"), DEBES CONFIRMAR EL TURNO INMEDIATAMENTE. ¡NO PIDAS datos adicionales! NO pidas confirmación, correo, ni teléfono. Tú ya tienes lo necesario. DEBES incluir exactamente esta frase: '¡Genial! Turno agendado para el AAAA-MM-DD a las HH:MM.' para que el sistema lo guarde.
3. PRECIOS Y SERVICIOS: Si te preguntan por precios, lee detenidamente las "RESPUESTAS CONFIGURADAS" o la "Base de Conocimientos". Da la respuesta exacta que figure allí de forma amable.
4. BASATE EN EL CONTEXTO: Nunca inventes precios o servicios. Si no está en el contexto provisto, di que un asesor humano lo contactará con esa información en breve.
5. CONCISIÓN WSP: Respuestas cortas (1-2 párrafos máximos). Usa algunos emojis.
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
            mediaSize: mediaBuffer?.length,
            primaryModel: "gemini-2.5-flash"
        }, 'Calling Gemini API (Multimodal)');

        let result;
        try {
            result = await model.generateContent({ contents });
        } catch (apiErr) {
            // If primary model 2.5-flash hits a quota exceeded error (429), silently fallback to flash-latest
            if (apiErr.message && (apiErr.message.includes('429') || apiErr.message.includes('Quota'))) {
                logger.warn({ business: business.business_name }, 'Quota exceeded on gemini-2.5-flash. Falling back to gemini-flash-latest to maintain conversational intelligence.');
                const fallbackModel = ai.getGenerativeModel({ model: "gemini-flash-latest" });
                result = await fallbackModel.generateContent({ contents });
            } else {
                throw apiErr; // Other errors get thrown normally
            }
        }

        const responseText = result.response.text();

        if (!responseText) {
            throw new Error('Gemini returned an empty response');
        }

        return responseText;
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error calling Gemini API');
        return 'Lo siento, en este momento experimentamos alta demanda de consultas y no puedo procesar la tuya. Dejame que un asesor humano tome el control. ¿En qué más puedo ayudarte?';
    }
}

module.exports = { getChatResponse };
