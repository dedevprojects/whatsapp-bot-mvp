const { generateTTS } = require('./services/tts');
const fs = require('fs');

async function testTomas() {
    try {
        console.log('Testing Tomas Voice...');
        const buffer = await generateTTS('Hola, soy Tomás y estoy probando el audio.', 'es-AR-TomasNeural');
        if (buffer) {
            console.log(`Success! ${buffer.length} bytes`);
            fs.writeFileSync('test-tomas.mp3', buffer);
        } else {
            console.log('Failed to generate Tomas voice.');
        }
    } catch (e) {
        console.error(e);
    }
}
testTomas();
