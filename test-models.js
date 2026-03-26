const https = require('https');
require('dotenv').config();
const key = process.env.GEMINI_API_KEY;
https.get('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("Modelos validos para ti:\n" + parsed.models.map(m => m.name).join('\n'));
      } else {
        console.log("Respuesta inesperada o error:", parsed);
      }
    } catch(e){ console.log(e, data) }
  });
}).on('error', console.error);
