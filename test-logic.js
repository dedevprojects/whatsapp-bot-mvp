const { handleMessage } = require('./bot/messageHandler');
require('dotenv').config();

const mockBusiness = {
    business_name: 'Test Business',
    description: 'A test business for the WhatsApp bot.',
    welcome_message: 'Hi there!',
    menu_options: {
        "1": "Option One",
        "2": "Option Two"
    },
    responses: {
        "1": "You chose one.",
        "2": "You chose two."
    }
};

const tests = [
    { input: 'hola', expected: 'Hi there!' },
    { input: '1', expected: 'You chose one.' },
    { input: 'menu', expected: 'Hi there!' },
    { input: '¿qué hora es?', expected: '' } // This should trigger Gemini
];

async function runTests() {
    for (const { input, expected } of tests) {
        const replies = await handleMessage({ senderJid: 'sender-jid', text: input, business: mockBusiness });
        
        if (replies.length === 0) {
            console.log(`Test [${input}]: ❌ NO REPLY`);
            continue;
        }

        const actual = replies[0];
        const success = expected === '' ? actual.length > 0 : actual.includes(expected);
        
        console.log(`Test [${input}]: ${success ? '✅ PASS' : '❌ FAIL'}`);
        if (expected === '') {
            console.log(`  AI Response: "${actual}"`);
        }
        if (!success) {
            console.log(`  Expected to contain: "${expected}"`);
            console.log(`  Actual: "${actual}"`);
        }
    }
}

runTests().catch(console.error);
