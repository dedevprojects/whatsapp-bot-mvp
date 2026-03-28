'use strict';

const supabase = require('../config/supabase');
const logger = require('./logger');
const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

/**
 * Custom Baileys auth state using Supabase with proper Buffer handling.
 */
async function useSupabaseAuthState(whatsappNumber) {
    let creds;
    let keys = {};

    // 1. Fetch from Supabase
    try {
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .select('data')
            .eq('whatsapp_number', whatsappNumber)
            .maybeSingle();

        if (error) {
            logger.error({ error, whatsappNumber }, 'Error loading session from Supabase');
        }

        if (data && data.data) {
            // Revive session structure. Supabase returns JSONB as an object.
            // We stringify it and parse with reviver to restore Buffers.
            const sessionData = JSON.stringify(data.data);
            const session = JSON.parse(sessionData, BufferJSON.reviver);
            creds = session.creds;
            keys = session.keys || {};
            logger.info({ whatsappNumber }, 'Session revived from Supabase');
        } else {
            creds = initAuthCreds();
            logger.info({ whatsappNumber }, 'Starting fresh session (none in DB)');
        }
    } catch (err) {
        logger.error({ err, whatsappNumber }, 'Fatal error loading session from Supabase');
        creds = initAuthCreds();
    }

    // 2. Saver helper (Direct)
    const saveSession = async () => {
        try {
            const jsonStr = JSON.stringify({ creds, keys }, BufferJSON.replacer);
            const sessionToSave = JSON.parse(jsonStr);
            
            const { error } = await supabase
                .from('whatsapp_sessions')
                .upsert({
                    whatsapp_number: whatsappNumber,
                    data: sessionToSave,
                    updated_at: new Date()
                }, { onConflict: 'whatsapp_number' });
            
            if (error) throw error;
        } catch (err) {
            logger.error({ err, whatsappNumber }, 'Error saving session to Supabase');
        }
    };

    // 3. Debounced version for frequent key updates
    let timeout;
    const debouncedSave = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(saveSession, 2000);
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const res = {};
                    const category = keys[type] || {};
                    for (const id of ids) {
                        let value = category[id];
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        res[id] = value;
                    }
                    return res;
                },
                set: async (data) => {
                    for (const type in data) {
                        if (!keys[type]) keys[type] = {};
                        Object.assign(keys[type], data[type]);
                    }
                    debouncedSave();
                }
            }
        },
        saveCreds: async () => {
            // Creds are critical, save immediately and wait
            await saveSession();
        }
    };
}

module.exports = { useSupabaseAuthState };
