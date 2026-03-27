require('dotenv').config();
const { processMessage } = require('./services/botEngine');

async function simulateMessage() {
    console.log('Simulating incoming message: "Hola"');
    
    // We mock the sendReply to see what would be sent
    const mockSendReply = async (jid, content, options) => {
        if (Buffer.isBuffer(content)) {
            console.log(`[BOT SENT AUDIO]: Size ${content.length} bytes, format: ${options?.mimetype}`);
        } else {
            console.log(`[BOT SENT TEXT]: "${content}"`);
        }
    };

    try {
        await processMessage({
            senderJid: '5491149407818@s.whatsapp.net', // The user
            recipientJid: '5491149407818:1@s.whatsapp.net', // The bot
            text: 'Hola',
            sendReply: mockSendReply,
            fromMe: false
        });
    } catch (e) {
        console.error('Simulation failed:', e);
    }
}

simulateMessage();
