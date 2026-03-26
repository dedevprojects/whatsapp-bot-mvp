require('dotenv').config();
const supabase = require('./config/supabase');

async function listAll() {
    const { data: businesses, error: bErr } = await supabase.from('businesses').select('*');
    if (bErr) console.error('Error businesses:', bErr);
    else console.log('Businesses:', JSON.stringify(businesses, null, 2));

    const { data: leads, error: lErr } = await supabase.from('leads').select('*');
    if (lErr) console.error('Error leads:', lErr);
    else console.log('Leads:', JSON.stringify(leads, null, 2));
}

listAll();
