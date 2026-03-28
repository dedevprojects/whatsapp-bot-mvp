'use strict';

/**
 * Menu Builder
 *
 * Generates a human-readable numbered menu from a business's menu_options object.
 * Example input:  { "1": "Ver menú", "2": "Reservar mesa" }
 * Example output: "1️⃣ Ver menú\n2️⃣ Reservar mesa"
 */

const NUMBER_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Returns an emoji for numbers 0–10, or a plain string fallback.
 * @param {string|number} num
 * @returns {string}
 */
function getNumberEmoji(num) {
    const n = parseInt(num, 10);
    return NUMBER_EMOJIS[n] || `${num}.`;
}

/**
 * Builds and returns the menu text.
 * @param {Record<string, string>} menuOptions
 * @returns {string}
 */
function buildMenu(menuOptions) {
    if (!menuOptions || typeof menuOptions !== 'object' || Object.keys(menuOptions).length === 0) {
        return '(Sin opciones de menú configuradas)';
    }

    const lines = Object.values(menuOptions)
        .filter(label => label && typeof label === 'string' && label.trim() !== '')
        .map((label, idx) => {
            const index = idx + 1;
            return `${getNumberEmoji(index)} ${label.trim()}`;
        });

    if (lines.length === 0) {
        return '(Sin opciones de menú configuradas)';
    }

    return lines.join('\n');
}

module.exports = { buildMenu };
