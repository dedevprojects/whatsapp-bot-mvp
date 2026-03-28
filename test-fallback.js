require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModel(modelName) {
    console.log(`Testing model: ${modelName}`);
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'Hola, prueba de fallback' }] }] });
        console.log(`Success ${modelName}:`, result.response.text());
        return true;
    } catch (e) {
        console.log(`Error ${modelName}:`, e.message);
        return false;
    }
}

async function run() {
    await testModel('gemini-flash-latest');
    await testModel('gemini-flash-lite-latest');
}
run();
