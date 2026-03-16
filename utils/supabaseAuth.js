'use strict';

const supabase = require('../config/supabase');
const logger = require('./logger');

/**
 * Custom Baileys auth state using Supabase
 * This allows the bot to persist sessions on ephemeral platforms like Render.
 */
async function useSupabaseAuthState(whatsappNumber) {
    // Helper to fetch/save to DB
    const loadSession = async () => {
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .select('data')
            .eq('whatsapp_number', whatsappNumber)
            .maybeSingle();
        
        if (error) {
            logger.error({ error, whatsappNumber }, 'Error loading session from Supabase');
            return null;
        }
        return data?.data || null;
    };

    const saveSession = async (sessionData) => {
        const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
                whatsapp_number: whatsappNumber,
                data: sessionData,
                updated_at: new Date()
            }, { onConflict: 'whatsapp_number' });

        if (error) {
            logger.error({ error, whatsappNumber }, 'Error saving session to Supabase');
        }
    };

    // Load initial data
    let session = await loadSession();
    
    // Baileys needs 'creds' and an 'keys' manager
    // Note: This is an MVP implementation. For high performance, 
    // we use a buffer for keys but persist creds immediately.
    
    const state = {
        creds: session?.creds || {
            signedRegistrationInfo: null,
            signedPreKey: null,
            registration: null,
            advSecretKey: null,
            nextPreKeyId: 1,
            firstUnuploadedPreKeyId: 1,
            serverHasPreKeys: false,
            account: null,
            me: null,
            signalIdentities: [],
            lastAccountSyncTimestamp: null,
            myAppStateKeyId: null,
        },
        keys: {
            get: (type, ids) => {
                const data = session?.keys?.[type] || {};
                return ids.reduce((acc, id) => {
                    acc[id] = data[id];
                    return acc;
                }, {});
            },
            set: (data) => {
                if (!session) session = { creds: state.creds, keys: {} };
                for (const type in data) {
                    if (!session.keys[type]) session.keys[type] = {};
                    Object.assign(session.keys[type], data[type]);
                }
                // Async save to not block
                saveSession(session);
            }
        }
    };

    return {
        state,
        saveCreds: async () => {
            if (!session) session = { creds: state.creds, keys: {} };
            session.creds = state.creds;
            await saveSession(session);
        }
    };
}

module.exports = { useSupabaseAuthState };
