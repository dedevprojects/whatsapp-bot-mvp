const { getChatResponse } = require('./services/gemini');
const fs = require('fs');
require('dotenv').config();

async function testAudioGemini() {
    try {
        console.log('Testing Gemini with Audio...');
        const audioBuffer = fs.readFileSync('test-audio.mp3');
        const business = { business_name: 'Test Business', description: 'A test business' };
        
        const response = await getChatResponse({
            text: '¿Qué dice este audio?',
            business,
            mediaBuffer: audioBuffer,
            mimeType: 'audio/mpeg'
        });
        
        console.log('Gemini Response:', response);
    } catch (e) {
        console.error('Test failed:', e);
    }
}

testAudioGemini();
