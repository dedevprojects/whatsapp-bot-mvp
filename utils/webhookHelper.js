'use strict';

const axios = require('axios');
const logger = require('./logger');

/**
 * Sends lead data to an external webhook (e.g. Google Sheets via Zapier/Make/Webhookr)
 * @param {string} webhookUrl - The target URL
 * @param {object} leadData - The lead information
 */
async function sendWebhook(webhookUrl, leadData) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
        return;
    }

    try {
        logger.info({ webhookUrl, contactName: leadData.contact_name }, 'Sending lead to webhook');
        await axios.post(webhookUrl, {
            ...leadData,
            source: 'Plusbot AI',
            timestamp: new Date().toISOString()
        }, { timeout: 5000 });
        logger.info('Webhook sent successfully');
    } catch (error) {
        logger.error({ error: error.message, webhookUrl }, 'Failed to send webhook');
    }
}

module.exports = { sendWebhook };
