require('dotenv').config();
const supabase = require('./config/supabase');

async function checkColumn() {
    console.log('--- Checking Business Table ---');
    const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error selecting from businesses:', error.message);
        return;
    }

    if (data && data.length > 0) {
        const row = data[0];
        console.log('Columns found:', Object.keys(row).join(', '));
        if ('description' in row) {
            console.log('✅ Column "description" exists!');
        } else {
            console.warn('❌ Column "description" is MISSING.');
        }
    } else {
        console.log('No records found, trying to select specific column...');
        const { error: colError } = await supabase
            .from('businesses')
            .select('description')
            .limit(1);
        
        if (colError) {
            console.warn('❌ Column "description" is MISSING or inaccessible:', colError.message);
        } else {
            console.log('✅ Column "description" exists (selected it specifically)!');
        }
    }
}

checkColumn();
