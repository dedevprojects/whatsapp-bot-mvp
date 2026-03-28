require('dotenv').config();
const supabase = require('./config/supabase');

async function run() {
    const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .limit(5);

    data.forEach(b => {
        console.log("Business:", b.business_name);
        console.log("Menu Options:", b.menu_options);
        console.log("Responses:", b.responses);
        console.log("Welcome Message:", b.welcome_message);
        console.log("Booking Enabled:", b.booking_enabled);
    });
}
run();
