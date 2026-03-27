const { generateTTS } = require('./services/tts');
const fs = require('fs');

async function testTTS() {
    try {
        console.log('Testing TTS...');
        const buffer = await generateTTS('Hola, esto es una prueba del bot universal.', 'es-MX-JorgeNeural');
        if (buffer) {
            console.log(`TTS Success! Buffer size: ${buffer.length}`);
            fs.writeFileSync('test-audio.mp3', buffer);
            console.log('Saved test-audio.mp3');
        } else {
            console.log('TTS Failed: No buffer returned.');
        }
    } catch (e) {
        console.error('TTS Error:', e);
    }
}

testTTS();
