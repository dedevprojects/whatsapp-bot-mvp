const { handleMessage } = require('./bot/messageHandler');

const mockBusiness = {
    business_name: 'Test Business',
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
    { input: 'something else', expected: 'Por favor elegí una opción del menú.' }
];

tests.forEach(({ input, expected }) => {
    const replies = handleMessage('sender-jid', input, mockBusiness);
    const success = replies[0].includes(expected);
    console.log(`Test [${input}]: ${success ? '✅ PASS' : '❌ FAIL'}`);
    if (!success) {
        console.log(`  Expected to contain: "${expected}"`);
        console.log(`  Actual: "${replies[0]}"`);
    }
});
