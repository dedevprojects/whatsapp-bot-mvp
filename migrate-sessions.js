'use strict';

/**
 * Migration Script: Local Sessions -> Supabase
 *
 * This script reads the `sessions/` directory, parses Baileys' file-based auth state,
 * and migrates it to the `whatsapp_sessions` table in Supabase.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { BufferJSON } = require('@whiskeysockets/baileys');
const supabase = require('./config/supabase');
const logger = require('./utils/logger');

const SESSIONS_DIR = path.resolve(process.cwd(), 'sessions');

async function migrate() {
    console.log('--- Starting Migration: Local Sessions to Supabase ---');

    if (!fs.existsSync(SESSIONS_DIR)) {
        console.error('Sessions directory not found');
        return;
    }

    const folders = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`Found ${folders.length} session folders:`, folders);

    for (const folder of folders) {
        console.log(`\nProcessing folder: [${folder}]...`);
        
        // Normalize the whatsapp number for the database key
        // Ensure it has the leading '+'
        let whatsappNumber = folder;
        if (!whatsappNumber.startsWith('+')) {
            whatsappNumber = '+' + whatsappNumber;
        }

        const folderPath = path.join(SESSIONS_DIR, folder);
        const files = fs.readdirSync(folderPath);

        let creds = null;
        let keys = {};

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            
            if (file === 'creds.json') {
                const content = fs.readFileSync(filePath, 'utf-8');
                creds = JSON.parse(content, BufferJSON.reviver);
                continue;
            }

            // Baileys keys are stored in files named: type-id.json
            // e.g., pre-key-1.json, session-5491149407818.0.json, etc.
            if (file.endsWith('.json')) {
                // Split by first the parts to deduce type and id
                // But filenames have many hyphens, like app-state-sync-key-AAAA.json
                // We'll use the common types Baileys uses:
                const types = [
                    'pre-key', 'session', 'sender-key', 'app-state-sync-key', 
                    'app-state-sync-version', 'sender-key-memory'
                ];
                
                let foundType = null;
                for (const t of types) {
                    if (file.startsWith(t + '-')) {
                        foundType = t;
                        break;
                    }
                }

                if (foundType) {
                    const id = file.slice(foundType.length + 1, -5); // remove 'type-' and '.json'
                    if (!keys[foundType]) keys[foundType] = {};
                    
                    const content = fs.readFileSync(filePath, 'utf-8');
                    keys[foundType][id] = JSON.parse(content, BufferJSON.reviver);
                }
            }
        }

        if (!creds) {
            console.warn(`⚠️  Skipping [${folder}]: No creds.json found`);
            continue;
        }

        // Prepare the session object matching our Supabase provider's structure
        // We use replacer to prepare the object for JSONB
        const jsonStr = JSON.stringify({ creds, keys }, BufferJSON.replacer);
        const sessionToSave = JSON.parse(jsonStr);

        console.log(`💾  Saving [${whatsappNumber}] to Supabase... (${Object.keys(keys).length} key types)`);

        const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
                whatsapp_number: whatsappNumber,
                data: sessionToSave,
                updated_at: new Date()
            }, { onConflict: 'whatsapp_number' });

        if (error) {
            console.error(`❌ Error saving [${whatsappNumber}]:`, error.message);
        } else {
            console.log(`✅ [${whatsappNumber}] successfully migrated.`);
        }
    }

    console.log('\n--- Migration Finished ---');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
});
