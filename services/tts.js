'use strict';

const { EdgeTTS } = require('edge-tts-universal');
const logger = require('../utils/logger');

/**
 * Generates an audio buffer from text using Microsoft Edge TTS (Zero Cost).
 * 
 * @param {string} text - The text to convert to speech
 * @param {string} voice - The voice to use (default: es-MX-JorgeNeural)
 * @returns {Promise<Buffer>} - The audio buffer (MP3/OGG)
 */
async function generateTTS(text, voice = 'es-MX-JorgeNeural') {
    if (!text) return null;

    try {
        const tts = new EdgeTTS();
        
        logger.info({ voice, textLength: text.length }, 'Generating TTS audio...');
        
        // EdgeTTS returns a buffer when we call it
        const buffer = await tts.getAudioBuffer(text, voice);
        
        logger.debug({ bufferSize: buffer?.length }, 'TTS generated successfully');
        return buffer;
    } catch (error) {
        logger.error({ error: error.message }, 'Error in TTS generation');
        return null;
    }
}

/**
 * List of recommended high-quality Spanish voices
 */
const RECOMMENDED_VOICES = {
    MEXICO_MALE: 'es-MX-JorgeNeural',
    MEXICO_FEMALE: 'es-MX-DaliaNeural',
    SPAIN_MALE: 'es-ES-AlvaroNeural',
    SPAIN_FEMALE: 'es-ES-ElviraNeural',
    ARGENTINA_MALE: 'es-AR-TomasNeural',
    ARGENTINA_FEMALE: 'es-AR-ElenaNeural'
};

module.exports = { generateTTS, RECOMMENDED_VOICES };
