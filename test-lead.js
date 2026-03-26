const axios = require('axios');

async function testLead() {
    console.log('--- Testing Lead Capture ---');
    try {
        const response = await axios.post('http://localhost:3000/api/leads', {
            business_name: 'Test Business',
            contact_name: 'Diego Test',
            contact_number: '+5491199999999'
        });
        console.log('Response:', response.data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

testLead();
