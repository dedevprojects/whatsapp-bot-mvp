'use strict';

const supabase = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Appointment Service
 * 
 * Handles calculating availability slots and booking appointments.
 * This service is additive and does not touch existing bot logic.
 */

/**
 * Generates available slots for a given business on a specific date.
 * Excludes already booked times.
 * 
 * @param {object} business - Business configuration
 * @param {string} dateStr  - Date to check (YYYY-MM-DD)
 * @returns {Promise<string[]>} List of available HH:MM strings
 */
async function getAvailableSlots(business, dateStr) {
    if (!business.booking_enabled) return [];

    const startStr = business.shift_start || '09:00';
    const endStr = business.shift_end || '18:00';
    const duration = business.slot_duration || 30;

    // 1. Fetch already booked slots for this date
    const { data: booked, error } = await supabase
        .from('appointments')
        .select('appointment_time')
        .eq('business_id', business.id)
        .gte('appointment_time', `${dateStr}T00:00:00Z`)
        .lt('appointment_time', `${dateStr}T23:59:59Z`)
        .eq('status', 'confirmed');

    if (error) {
        logger.error({ error, businessId: business.id }, 'Error loading booked slots');
        return [];
    }

    const bookedTimes = (booked || []).map(b => {
        // Extract HH:MM from ISO string (careful with timezone, but keeping it simple)
        const date = new Date(b.appointment_time);
        return date.getUTCHours().toString().padStart(2, '0') + ':' + 
               date.getUTCMinutes().toString().padStart(2, '0');
    });

    // 2. Generate all theoretical slots
    const slots = [];
    let [h, m] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    
    let currentTotalMinutes = h * 60 + m;
    const endTotalMinutes = eh * 60 + em;

    while (currentTotalMinutes + duration <= endTotalMinutes) {
        const hh = Math.floor(currentTotalMinutes / 60).toString().padStart(2, '0');
        const mm = (currentTotalMinutes % 60).toString().padStart(2, '0');
        const time = `${hh}:${mm}`;

        // 3. Only add if not booked
        if (!bookedTimes.includes(time)) {
            slots.push(time);
        }

        currentTotalMinutes += duration;
    }

    return slots;
}

/**
 * Books an appointment for a user.
 * 
 * @param {object} params
 * @param {string} params.businessId
 * @param {string} params.contactName
 * @param {string} params.contactNumber
 * @param {string} params.isoDateTime  - ISO format string for the appointment
 */
async function bookAppointment({ businessId, contactName, contactNumber, isoDateTime }) {
    const { data, error } = await supabase
        .from('appointments')
        .insert([{
            business_id: businessId,
            contact_name: contactName,
            contact_number: contactNumber,
            appointment_time: isoDateTime,
            status: 'confirmed'
        }])
        .select()
        .single();

    if (error) {
        logger.error({ error, businessId, contactNumber }, 'Failed to book appointment');
        throw error;
    }

    logger.info({ id: data.id, businessId, time: isoDateTime }, 'Appointment booked successfully');
    return data;
}

module.exports = { getAvailableSlots, bookAppointment };
