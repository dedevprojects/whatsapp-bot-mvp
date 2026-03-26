require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkTables() {
    console.log('--- Database Check ---');
    try {
        const { error: bizError } = await supabase.from('businesses').select('*').limit(1);
        console.log('Businesses table exists:', !bizError);
        if (bizError) console.error('Businesses Error:', bizError.message);
        
        const { error: leadsError } = await supabase.from('leads').select('*').limit(1);
        console.log('Leads table exists:', !leadsError);
        if (leadsError) console.error('Leads Error:', leadsError.message);

        const { error: sessionsError } = await supabase.from('whatsapp_sessions').select('*').limit(1);
        console.log('Sessions table exists:', !sessionsError);
        if (sessionsError) console.error('Sessions Error:', sessionsError.message);
    } catch (e) {
        console.error('Fatal error checking tables:', e);
    }
}

checkTables();
