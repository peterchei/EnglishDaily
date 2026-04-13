'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { buildTTSScript, parseTelegramSummary, getPreviouslyTaughtWords, fetchBBCNewsContext } = require('./lib/lesson-utils');

// ── Config from environment ──────────────────────────────────────────────────
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

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

const REGEN_AUDIO = process.argv.includes('--regen-audio');

// ── State check ──────────────────────────────────────────────────────────────
let state = {};
try {
    if (fs.existsSync(STATE_FILE)) state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) { console.error('[WARN] Could not read state.json:', e.message); }

if (!REGEN_AUDIO && state[today] && state[today].sent) {
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

    // Build dedup list from all previous lessons
    const taughtWords = getPreviouslyTaughtWords(LESSONS_DIR);
    const dedupBlock = taughtWords.length > 0
        ? `\n\nIMPORTANT — Do NOT reuse any of these previously taught words/phrases:\n${taughtWords.join(', ')}\n`
        : '';

    // Fetch BBC News for topical vocabulary context
    let newsBlock = '';
    try {
        console.log('[INFO] Fetching BBC News for vocabulary context...');
        const newsContext = await fetchBBCNewsContext();
        if (newsContext) {
            newsBlock = `\n\nHere are today's BBC News headlines. Pick vocabulary that appears in or relates to these news stories, \
so the learner studies words that are relevant to current events:\n${newsContext}\n`;
            console.log('[INFO] BBC News context fetched successfully.');
        } else {
            console.log('[INFO] No BBC News context available, using general vocabulary.');
        }
    } catch (e) {
        console.warn(`[WARN] BBC News fetch failed: ${e.message}. Using general vocabulary.`);
    }

    const prompt = `Please prepare today's English lesson dated ${today}. \
Select 6-7 useful words or phrases suitable for a 5-minute teaching session \
aimed at a Cantonese speaker learning British English.
${newsBlock}${dedupBlock}
Requirements:
1. For each word, provide: IPA pronunciation, English definition, Cantonese Meaning, \
and exactly TWO English example sentences each followed by a Cantonese translation.
2. Use the markdown format below EXACTLY — do not deviate, add sections, or change field names.
3. Word names MUST be wrapped in **double asterisks** as shown. Field labels must match exactly.
4. Do NOT use the word "Master" anywhere. Use "Hello everyone" or "Hi there" instead.
5. Output ONLY the markdown content, starting with the # header.
6. Every word MUST be different from the previously taught words listed above. Choose fresh, diverse vocabulary.
7. Prefer words that a Cantonese speaker would encounter in British news, workplace, or daily life.

Format for each entry (number sequentially: 1, 2, 3, ...):
## 1. **Word** (Part of Speech)
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

// ── Step 2: Generate audio via Google TTS (with edge-tts fallback) ───────────
async function generateAudio(markdown) {
    if (fs.existsSync(audioFile)) {
        console.log(`[INFO] Audio file already exists: ${audioFile}`);
        return;
    }

    const ttsText = buildTTSScript(markdown);

    // ── 2a. Try Google TTS ────────────────────────────────────────────────────
    console.log('[INFO] Attempting audio with Google TTS...');
    try {
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
        if (res.ok && data.audioContent) {
            const mp3Buffer = Buffer.from(data.audioContent, 'base64');
            fs.writeFileSync(audioFile, mp3Buffer);
            console.log(`[INFO] Audio saved (Google TTS) → ${audioFile}`);
            return;
        }
        console.warn(`[WARN] Google TTS failed (${res.status}): ${JSON.stringify(data)}`);
    } catch (e) {
        console.warn(`[WARN] Google TTS error: ${e.message}`);
    }

    // ── 2b. Fall back to edge-tts ─────────────────────────────────────────────
    const edgeTtsScript = process.env.EDGE_TTS_SCRIPT ||
        '/home/peterchei/.openclaw/workspace/skills/edge-tts/scripts/tts-converter.js';

    if (!fs.existsSync(edgeTtsScript)) {
        console.warn(`[WARN] edge-tts not found at ${edgeTtsScript}. Skipping audio.`);
        return;
    }

    console.log('[INFO] Falling back to edge-tts...');
    const result = spawnSync('node', [
        edgeTtsScript, ttsText,
        '--output', audioFile,
        '--voice', 'en-GB-LibbyNeural'
    ], { cwd: BASE_DIR, stdio: 'inherit' });
    if (result.status === 0) {
        console.log(`[INFO] Audio saved (edge-tts) → ${audioFile}`);
        return;
    }
    console.warn(`[WARN] edge-tts failed (exit ${result.status}). Trying Python edge-tts...`);
    if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);

    // ── 2c. Fall back to Python edge-tts CLI ─────────────────────────────────
    const tmpTextFile = path.join(os.tmpdir(), `tts_text_${today}.txt`);
    try {
        fs.writeFileSync(tmpTextFile, ttsText, 'utf8');
        const pyResult = spawnSync('edge-tts', [
            '--voice', 'en-GB-LibbyNeural',
            '--file', tmpTextFile,
            '--write-media', audioFile
        ], { cwd: BASE_DIR, stdio: 'inherit' });
        if (pyResult.status === 0) {
            console.log(`[INFO] Audio saved (Python edge-tts) → ${audioFile}`);
        } else {
            console.warn(`[WARN] Python edge-tts also failed. Continuing without audio.`);
            if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
        }
    } finally {
        if (fs.existsSync(tmpTextFile)) fs.unlinkSync(tmpTextFile);
    }
}

// ── Step 3: Update dashboard ──────────────────────────────────────────────────
function updateDashboard() {
    console.log('[INFO] Updating dashboard...');
    execSync('python update_index.py', { cwd: BASE_DIR, stdio: 'inherit' });
    console.log('[INFO] Dashboard updated.');
}

// ── Step 4: Git commit and push ───────────────────────────────────────────────
function gitPush() {
    console.log('[INFO] Committing and pushing to GitHub...');
    execSync('git add lessons/ media/ lib/ index.html README.md sw.js manifest.json', { cwd: BASE_DIR, stdio: 'inherit' });
    execSync(`git commit -m "Daily update: ${today}"`, { cwd: BASE_DIR, stdio: 'inherit' });
    execSync('git push', { cwd: BASE_DIR, stdio: 'inherit' });
    console.log('[INFO] Pushed to GitHub.');
}

// ── Step 5: Send Telegram summary ─────────────────────────────────────────────
async function sendTelegram(markdown) {
    console.log('[INFO] Sending Telegram message...');
    const message = parseTelegramSummary(markdown, today);

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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`[INFO] Starting daily lesson for ${today}`);
    try {
        if (REGEN_AUDIO) {
            if (!fs.existsSync(lessonFile)) {
                console.error(`[ERROR] No lesson file for today: ${lessonFile}`);
                process.exit(1);
            }
            console.log('[INFO] --regen-audio: regenerating audio only (no Telegram, no state update).');
            if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
            const lessonContent = fs.readFileSync(lessonFile, 'utf8');
            await generateAudio(lessonContent);
            if (fs.existsSync(audioFile)) {
                execSync('git add media/', { cwd: BASE_DIR, stdio: 'inherit' });
                execSync(`git commit -m "Regen audio: ${today}"`, { cwd: BASE_DIR, stdio: 'inherit' });
                execSync('git push', { cwd: BASE_DIR, stdio: 'inherit' });
                console.log('[INFO] Audio committed and pushed.');
            }
            console.log('[INFO] Done.');
            return;
        }

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
