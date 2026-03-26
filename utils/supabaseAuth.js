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
            // Revive session using Baileys' own BufferJSON utility
            // We stringify the DB object first to ensure the reviver can handle the format
            const sessionData = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
            const session = JSON.parse(sessionData, BufferJSON.reviver);
            creds = session.creds;
            keys = session.keys || {};
            logger.info({ whatsappNumber }, 'Session loaded from Supabase');
        } else {
            // Start fresh
            creds = initAuthCreds();
            logger.info({ whatsappNumber }, 'Starting fresh session (none found in DB)');
        }
    } catch (err) {
        logger.error({ err, whatsappNumber }, 'Fatal error loading session from Supabase');
        creds = initAuthCreds();
    }

    // 2. Saver helper
    const saveSession = async () => {
        try {
            // Stringify with replacer to mark Buffers
            const jsonStr = JSON.stringify({ creds, keys }, BufferJSON.replacer);
            // Parse back to object so Supabase receives a JSONB-compatible object
            const sessionToSave = JSON.parse(jsonStr);
            
            await supabase
                .from('whatsapp_sessions')
                .upsert({
                    whatsapp_number: whatsappNumber,
                    data: sessionToSave,
                    updated_at: new Date()
                }, { onConflict: 'whatsapp_number' });
        } catch (err) {
            logger.error({ err, whatsappNumber }, 'Error saving session to Supabase');
        }
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
                    await saveSession();
                }
            }
        },
        saveCreds: async () => {
            await saveSession();
        }
    };
}

module.exports = { useSupabaseAuthState };
