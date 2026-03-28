require('dotenv').config();
const supabase = require('./config/supabase');

async function run() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
        
    if (error) {
        console.error(error);
        return;
    }
    
    data.reverse().forEach(m => {
        console.log(`[${m.direction}] ${m.message_text}`);
    });
}
run();
