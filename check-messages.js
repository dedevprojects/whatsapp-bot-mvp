const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    console.log('--- Checking Recent Messages ---');
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }
    
    data.forEach(m => {
        const time = new Date(m.created_at).toLocaleTimeString();
        console.log(`[${time}] ${m.direction.toUpperCase()}: "${m.message_text}"`);
    });
}

check();
