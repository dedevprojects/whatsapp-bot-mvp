require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function listLeads() {
    console.log('--- Current Leads ---');
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching leads:', error.message);
        return;
    }
    if (data.length === 0) {
        console.log('No leads found.');
    } else {
        console.table(data);
    }
}

listLeads();
