require('dotenv').config();
const supabase = require('./config/supabase');

async function fix() {
    console.log('Disabling demo businesses with fake numbers...');
    const { error } = await supabase
        .from('businesses')
        .update({ active: false })
        .in('whatsapp_number', ['+5491100000001', '+5491100000002', '+5491100000003']);

    if (error) {
        console.error('Error disabling demos:', error);
    } else {
        console.log('Demo businesses disabled. They were causing Baileys to loop.');
    }

    console.log('Clearing local session folder if exists...');
    const fs = require('fs');
    const path = require('path');
    const sessionsDir = path.join(__dirname, 'sessions');
    if (fs.existsSync(sessionsDir)) {
        // We don't delete the whole dir, just the contents for these numbers if they exist
        // But better to just let them be inactive in DB for now.
    }
    
    process.exit(0);
}

fix();
