'use strict';

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    logger.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

logger.info('Supabase client initialized');

module.exports = supabase;
