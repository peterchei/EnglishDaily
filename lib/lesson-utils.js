'use strict';

/**
 * Pure utility functions for EnglishDaily lesson processing.
 * Extracted here so they can be unit-tested independently of API calls.
 */

/**
 * Escape all Telegram MarkdownV2 reserved characters in a plain-text string.
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Do NOT use on strings that already contain intentional MarkdownV2 formatting.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeMarkdownV2(text) {
    return String(text).replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&');
}

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
        const wordMatch = block.match(/##\s*\d+\.\s+(?:\*\*)?([^*(\n]+?)(?:\*\*)?\s*(?:\(|$)/m);
        const pronMatch = block.match(/\*\*Pronunciation[^*]*\*\*\s*[:：]?\s*(.+)/);
        const defMatch  = block.match(/\*\*Definition[^*]*\*\*\s*[:：]?\s*(.+)/);
        const ex1Match  = block.match(/\*\*Example 1[^*]*\*\*\s*[:：]?\s*\n?([\s\S]*?)(?=\n\*\*Cantonese Example|\n\*\*Example 2|\n##|$)/);

        if (!wordMatch) return;

        const word = wordMatch[1].trim();
        const pron = pronMatch ? pronMatch[1].replace(/\*+/g, '').trim() : '';
        const def  = defMatch  ? defMatch[1].replace(/\*+/g, '').trim() : '';
        const ex1  = ex1Match  ? ex1Match[1].replace(/\*+/g, '').replace(/\n/g, ' ').trim() : '';

        script += `Word ${i + 1}: ${word}.\n`;
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
 * All dynamic content is escaped for MarkdownV2.
 *
 * @param {string} markdown - Full lesson markdown content
 * @param {string} today    - Date string YYYY-MM-DD
 * @returns {string} Telegram MarkdownV2 formatted message
 */
function parseTelegramSummary(markdown, today) {
    const blocks = markdown.split(/\n(?=##\s*\d+\.)/);
    // today contains hyphens which are reserved in MarkdownV2 — must escape
    const safeDate = escapeMarkdownV2(today);
    let summary = `📚 *Daily English Lesson — ${safeDate}*\n\n*Today's Vocabulary:*\n`;
    let i = 1;

    blocks.forEach(block => {
        const wordMatch = block.match(/##\s*\d+\.\s+(?:\*\*)?([^*(\n]+?)(?:\*\*)?\s*(?:\(|$)/m);
        const cantMatch = block.match(/\*\*Cantonese(?:\s+Meaning)?[^*]*\*\*\s*[:：]?\s*(.+)/);
        if (!wordMatch) return;
        const word = escapeMarkdownV2(wordMatch[1].trim());
        const cant = cantMatch ? escapeMarkdownV2(cantMatch[1].replace(/\*+/g, '').trim()) : '';
        summary += `${i}\\. *${word}*${cant ? ` — ${cant}` : ''}\n`;
        i++;
    });

    summary += `\nThe dashboard has been updated\\. Have a great day\\! 🚀`;
    return summary;
}

/**
 * Scan all lesson markdown files and extract previously taught words.
 * Returns a sorted, deduplicated, lowercased list of words/phrases.
 *
 * @param {string} lessonsDir - Absolute path to the lessons directory
 * @returns {string[]} Sorted unique word list (lowercased)
 */
function getPreviouslyTaughtWords(lessonsDir) {
    const fs = require('fs');
    const path = require('path');
    const words = new Set();

    function scanDir(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(full);
            } else if (entry.name.startsWith('vocabulary_') && entry.name.endsWith('.md')) {
                try {
                    const content = fs.readFileSync(full, 'utf8');
                    const matches = content.matchAll(/##\s*\d+\.\s+(?:\*\*)?([^*(\n]+?)(?:\*\*)?\s*(?:\(|$)/gm);
                    for (const m of matches) {
                        const word = m[1].trim().toLowerCase();
                        if (word) words.add(word);
                    }
                } catch { /* skip unreadable files */ }
            }
        }
    }

    scanDir(lessonsDir);
    return [...words].sort();
}

/**
 * Fetch BBC News RSS feed and return a summary of headlines + descriptions.
 * Uses BBC World News RSS. Falls back gracefully on error.
 *
 * @returns {Promise<string>} News context string, or empty string on failure
 */
async function fetchBBCNewsContext() {
    const feeds = [
        'https://feeds.bbci.co.uk/news/rss.xml',
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://feeds.bbci.co.uk/news/technology/rss.xml'
    ];

    const articles = [];
    for (const feedUrl of feeds) {
        try {
            const res = await fetch(feedUrl, {
                headers: { 'User-Agent': 'EnglishDaily/1.0' },
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) continue;
            const xml = await res.text();

            // Simple XML parsing — extract <item><title> and <description>
            const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
            for (const item of items.slice(0, 5)) {
                const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
                const desc = (item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
                if (title) articles.push(`- ${title.trim()}${desc ? ': ' + desc.trim() : ''}`);
            }
        } catch {
            // Network error — continue with other feeds
        }
    }

    if (articles.length === 0) return '';
    return articles.slice(0, 12).join('\n');
}

module.exports = { buildTTSScript, parseTelegramSummary, escapeMarkdownV2, getPreviouslyTaughtWords, fetchBBCNewsContext };
