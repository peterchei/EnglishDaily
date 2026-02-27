'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config from environment ──────────────────────────────────────────────────
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID  = process.env.TELEGRAM_CHAT_ID;

if (!GEMINI_API_KEY)     { console.error('[ERROR] GEMINI_API_KEY is not set.'); process.exit(1); }
if (!TELEGRAM_BOT_TOKEN) { console.error('[ERROR] TELEGRAM_BOT_TOKEN is not set.'); process.exit(1); }
if (!TELEGRAM_CHAT_ID)   { console.error('[ERROR] TELEGRAM_CHAT_ID is not set.'); process.exit(1); }

// ── Paths (cross-platform: works on Linux in OpenClaw and Windows locally) ───
const BASE_DIR    = __dirname;
const LESSONS_DIR = path.join(BASE_DIR, 'lessons');
const MEDIA_DIR   = path.join(BASE_DIR, 'media');
const STATE_FILE  = path.join(BASE_DIR, 'state.json');

const today      = new Date().toISOString().split('T')[0];
const lessonFile = path.join(LESSONS_DIR, `vocabulary_${today}.md`);
const audioFile  = path.join(MEDIA_DIR,   `${today}_pronunciation.mp3`);

fs.mkdirSync(LESSONS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR,   { recursive: true });

// ── State check ──────────────────────────────────────────────────────────────
let state = {};
try {
    if (fs.existsSync(STATE_FILE)) state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) { console.error('[WARN] Could not read state.json:', e.message); }

if (state[today] && state[today].sent) {
    console.log(`[INFO] Lesson for ${today} already sent. Exiting.`);
    process.exit(0);
}

// ── Step 1: Generate lesson via Gemini ──────────────────────────────────────
async function generateLesson() {
    if (fs.existsSync(lessonFile)) {
        console.log(`[INFO] Lesson file already exists: ${lessonFile}`);
        return fs.readFileSync(lessonFile, 'utf8');
    }

    console.log('[INFO] Generating lesson with Gemini...');

    const prompt = `Please prepare today's English lesson dated ${today}. \
Select 6-7 useful words or phrases suitable for a 5-minute teaching session \
aimed at a Cantonese speaker learning British English.

Requirements:
1. For each word, provide: IPA pronunciation, English definition, Cantonese Meaning, \
and exactly TWO English example sentences each followed by a Cantonese translation.
2. Use the markdown format below exactly — do not add extra sections.
3. Do NOT use the word "Master" anywhere. Use "Hello everyone" or "Hi there" instead.
4. Output ONLY the markdown content, starting with the # header.

Format for each entry:
## N. **Word** (Part of Speech)
**Pronunciation:** /IPA/
**Definition:** English definition here.
**Cantonese Meaning:** 廣東話意思

**Example 1:**
An English example sentence.
**Cantonese Example 1:**
廣東話翻譯

**Example 2:**
Another English example sentence.
**Cantonese Example 2:**
廣東話翻譯

Begin the file with:
# Daily English Lesson - ${today}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.85, maxOutputTokens: 4096 }
        })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${JSON.stringify(data)}`);

    const content = data.candidates[0].content.parts[0].text.trim();
    fs.writeFileSync(lessonFile, content, 'utf8');
    console.log(`[INFO] Lesson saved → ${lessonFile}`);
    return content;
}

// ── Step 2: Build TTS script (English-only narration) ───────────────────────
function buildTTSScript(markdown) {
    const blocks = markdown.split(/\n(?=##\s*\d+\.)/);
    const items = blocks.filter(b => /##\s*\d+\./.test(b));

    let script = 'Hello everyone! Welcome to your daily English lesson. ' +
                 `Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. ` +
                 `We have ${items.length} words for you today.\n\n`;

    items.forEach((block, i) => {
        const wordMatch = block.match(/##\s*\d+\.\s+\*\*(.*?)\*\*/);
        const pronMatch = block.match(/\*\*Pronunciation[:\*]*\*?\*?\s*[:：]?\s*(.+)/);
        const defMatch  = block.match(/\*\*Definition[:\*]*\*?\*?\s*[:：]?\s*(.+)/);
        const ex1Match  = block.match(/\*\*Example 1[:\*]*\*?\*?\s*[:：]?\s*\n?([\s\S]*?)(?=\n\*\*Cantonese Example|\n\*\*Example 2|\n##|$)/);

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

// ── Step 3: Generate audio via Google TTS ───────────────────────────────────
async function generateAudio(markdown) {
    if (fs.existsSync(audioFile)) {
        console.log(`[INFO] Audio file already exists: ${audioFile}`);
        return;
    }

    console.log('[INFO] Generating audio with Google TTS...');
    const ttsText = buildTTSScript(markdown);

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: { text: ttsText },
            voice: { languageCode: 'en-GB', name: 'en-GB-Neural2-B' },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 }
        })
    });

    const data = await res.json();
    if (!res.ok) {
        console.warn(`[WARN] Google TTS failed (${res.status}): ${JSON.stringify(data)}`);
        console.warn('[WARN] Continuing without audio.');
        return;
    }

    const mp3Buffer = Buffer.from(data.audioContent, 'base64');
    fs.writeFileSync(audioFile, mp3Buffer);
    console.log(`[INFO] Audio saved → ${audioFile}`);
}

// ── Step 4: Update dashboard ─────────────────────────────────────────────────
function updateDashboard() {
    console.log('[INFO] Updating dashboard...');
    execSync('python update_index.py', { cwd: BASE_DIR, stdio: 'inherit' });
    console.log('[INFO] Dashboard updated.');
}

// ── Step 5: Git commit and push ──────────────────────────────────────────────
function gitPush() {
    console.log('[INFO] Committing and pushing to GitHub...');
    execSync('git add lessons/ media/ index.html README.md sw.js manifest.json', { cwd: BASE_DIR, stdio: 'inherit' });
    execSync(`git commit -m "Daily update: ${today}"`, { cwd: BASE_DIR, stdio: 'inherit' });
    execSync('git push', { cwd: BASE_DIR, stdio: 'inherit' });
    console.log('[INFO] Pushed to GitHub.');
}

// ── Step 6: Send Telegram summary ───────────────────────────────────────────
function parseTelegramSummary(markdown) {
    const blocks = markdown.split(/\n(?=##\s*\d+\.)/);
    let summary = `📚 *Daily English Lesson — ${today}*\n\n*Today's Vocabulary:*\n`;
    let i = 1;

    blocks.forEach(block => {
        const wordMatch = block.match(/##\s*\d+\.\s+\*\*(.*?)\*\*/);
        const cantMatch = block.match(/\*\*Cantonese Meaning[:\*]*\*?\*?\s*[:：]?\s*(.+)/);
        if (!wordMatch) return;
        const word = wordMatch[1].trim();
        const cant = cantMatch ? cantMatch[1].replace(/\*+/g, '').trim() : '';
        summary += `${i}. *${word}*${cant ? ` — ${cant}` : ''}\n`;
        i++;
    });

    summary += `\nThe dashboard has been updated\\. Have a great day\\! 🚀`;
    return summary;
}

async function sendTelegram(markdown) {
    console.log('[INFO] Sending Telegram message...');
    const message = parseTelegramSummary(markdown);

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'MarkdownV2'
        })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
        throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
    }
    console.log('[INFO] Telegram message sent.');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`[INFO] Starting daily lesson for ${today}`);
    try {
        const lessonContent = await generateLesson();
        await generateAudio(lessonContent);
        updateDashboard();
        gitPush();
        await sendTelegram(lessonContent);

        state[today] = { sent: true, date: new Date().toISOString() };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        console.log('[INFO] Done. Lesson delivered successfully.');

    } catch (err) {
        console.error('[ERROR]', err.message || err);
        process.exit(1);
    }
}

main();
