'use strict';

/**
 * Pure utility functions for EnglishDaily lesson processing.
 * Extracted here so they can be unit-tested independently of API calls.
 */

/**
 * Build an English-only TTS narration script from lesson markdown.
 * Cantonese sections are intentionally excluded.
 *
 * @param {string} markdown - Full lesson markdown content
 * @returns {string} Plain text suitable for TTS
 */
function buildTTSScript(markdown) {
    const blocks = markdown.split(/\n(?=##\s*\d+\.)/);
    const items = blocks.filter(b => /##\s*\d+\./.test(b));

    const dateMatch = markdown.match(/# Daily English Lesson - (\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch
        ? new Date(dateMatch[1]).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';

    let script = 'Hello everyone! Welcome to your daily English lesson. ';
    if (dateStr) script += `Today is ${dateStr}. `;
    script += `We have ${items.length} word${items.length !== 1 ? 's' : ''} for you today.\n\n`;

    items.forEach((block, i) => {
        const wordMatch = block.match(/##\s*\d+\.\s+\*\*(.*?)\*\*/);
        const pronMatch = block.match(/\*\*Pronunciation[^*]*\*\*\s*[:：]?\s*(.+)/);
        const defMatch  = block.match(/\*\*Definition[^*]*\*\*\s*[:：]?\s*(.+)/);
        const ex1Match  = block.match(/\*\*Example 1[^*]*\*\*\s*[:：]?\s*\n?([\s\S]*?)(?=\n\*\*Cantonese Example|\n\*\*Example 2|\n##|$)/);

        if (!wordMatch) return;

        const word = wordMatch[1].trim();
        const pron = pronMatch ? pronMatch[1].replace(/\*+/g, '').trim() : '';
        const def  = defMatch  ? defMatch[1].replace(/\*+/g, '').trim() : '';
        const ex1  = ex1Match  ? ex1Match[1].replace(/\*+/g, '').replace(/\n/g, ' ').trim() : '';

        script += `Word ${i + 1}: ${word}.\n`;
        if (pron) script += `Pronunciation: ${pron}.\n`;
        if (def)  script += `Definition: ${def}\n`;
        if (ex1)  script += `Example: ${ex1}\n`;
        script += '\n';
    });

    script += "That's all for today's lesson. Keep practising and have a wonderful day!";
    return script.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
}

/**
 * Parse lesson markdown into a Telegram MarkdownV2 summary.
 * Lists each word with its Cantonese meaning.
 *
 * @param {string} markdown - Full lesson markdown content
 * @param {string} today    - Date string YYYY-MM-DD
 * @returns {string} Telegram MarkdownV2 formatted message
 */
function parseTelegramSummary(markdown, today) {
    const blocks = markdown.split(/\n(?=##\s*\d+\.)/);
    let summary = `📚 *Daily English Lesson — ${today}*\n\n*Today's Vocabulary:*\n`;
    let i = 1;

    blocks.forEach(block => {
        const wordMatch = block.match(/##\s*\d+\.\s+\*\*(.*?)\*\*/);
        const cantMatch = block.match(/\*\*Cantonese Meaning[^*]*\*\*\s*[:：]?\s*(.+)/);
        if (!wordMatch) return;
        const word = wordMatch[1].trim();
        const cant = cantMatch ? cantMatch[1].replace(/\*+/g, '').trim() : '';
        summary += `${i}. *${word}*${cant ? ` — ${cant}` : ''}\n`;
        i++;
    });

    summary += `\nThe dashboard has been updated\\. Have a great day\\! 🚀`;
    return summary;
}

module.exports = { buildTTSScript, parseTelegramSummary };
