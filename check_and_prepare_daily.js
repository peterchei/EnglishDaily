const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Config
const WORKSPACE_DIR = '/home/peterchei/.openclaw/workspace/EnglishDaily';
const CONTENT_DIR = path.join(WORKSPACE_DIR, 'content');
const MEDIA_DIR = path.join(WORKSPACE_DIR, 'media');
const STATE_FILE = path.join(WORKSPACE_DIR, 'state.json');
const TTS_SCRIPT = '/home/peterchei/.openclaw/workspace/skills/edge-tts/scripts/tts-converter.js';

// Get today's date YYYY-MM-DD
const today = new Date().toISOString().split('T')[0];
const contentFile = path.join(CONTENT_DIR, `${today}.md`);
const audioFile = path.join(MEDIA_DIR, `${today}_pronunciation.mp3`);

// Ensure dirs
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Check state
let state = {};
if (fs.existsSync(STATE_FILE)) {
    try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading state file:", e);
    }
}

if (state[today] && state[today].sent) {
    // console.log(`Lesson for ${today} already sent.`);
    process.exit(0);
}

if (!fs.existsSync(contentFile)) {
    // console.log(`Lesson for ${today} not found yet.`);
    process.exit(0);
}

// console.log(`Found lesson for ${today}. Preparing to send...`);

// Parse content for TTS and Summary
const content = fs.readFileSync(contentFile, 'utf8');

// Simple parser for summary
function parseSummary(md) {
    const lines = md.split('\n');
    let words = [];
    
    // Regex for: ## 1. **Word** (Type) OR ## 1. Word (Type)
    // Also captures Cantonese meaning if available
    
    // We want a list like:
    // 1. **Word** (Cantonese)
    
    let currentWord = null;
    
    // Track lines to avoid dupes
    let seenWords = new Set();
    
    // We iterate through lines and look for "## Number." headers
    // Then scan subsequent lines for "Cantonese Meaning" or "Cantonese:"
    
    // New logic: Split by headers first to get blocks
    const blocks = md.split(/\n(?=##\s*\d+\.)/);
    
    blocks.forEach(block => {
        const headerMatch = block.match(/##\s*\d+\.\s+(?:(?:\*\*(.*?)\*\*)|(.*?))(?:\s*\(|$)/);
        if (headerMatch) {
            const word = (headerMatch[1] || headerMatch[2]).trim();
            if (seenWords.has(word)) return;
            seenWords.add(word);
            
            // Find Cantonese Meaning
            // Matches: **Cantonese Meaning**: ... or **Cantonese**: ...
            // Allow optional ** around label, optional colon
            const cantMatch = block.match(/(?:\*\*Cantonese(?: Meaning)?\*\*|Cantonese(?: Meaning)?)\s*[:：]?\s*(.*)/i);
            const cantonese = cantMatch ? cantMatch[1].trim() : '';
            
            words.push({ word, cantonese });
        }
    });
    
    let summary = `Here is your daily English lesson for ${today}.\n\n**Today's Vocabulary:**\n`;
    words.forEach((w, i) => {
        // If cantonese is missing, maybe fallback to definition? No, just keep it clean.
        const cantPart = w.cantonese ? ` (${w.cantonese})` : '';
        summary += `${i + 1}. **${w.word}**${cantPart}\n`;
    });
    
    summary += `\nThe dashboard has been updated. The audio guide is attached. Have a great day!`;
    return summary;
}

// Generate Audio if missing
if (!fs.existsSync(audioFile)) {
    // console.log("Generating audio...");
    
    // Parse text for TTS (simple version: read everything or just English)
    // For now, let's just read the raw content but strip markdown bold/headers?
    // Actually, Edge TTS handles some text okay. Let's use a simple cleaner.
    const ttsText = content.replace(/##/g, '').replace(/\*\*/g, '').replace(/`/g, '');
    
    // Use proper quoting for shell command
    const safeText = ttsText.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const cmd = `node "${TTS_SCRIPT}" "${safeText}" --output "${audioFile}" --voice en-US-AriaNeural --rate -10%`;
    
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error("Failed to generate audio:", e);
        // Continue without audio? Or fail? Let's try to send text at least.
    }
}

// Send the message via openclaw CLI
const summary = parseSummary(content);
const audio = fs.existsSync(audioFile) ? audioFile : null;

// Use 'openclaw message send' command
// Assuming openclaw is in PATH or specify full path
const OPENCLAW_CLI = 'openclaw';
const TARGET_ID = '2106531039';

try {
    // Construct the command
    // We need to escape the message content for shell
    const escapedSummary = summary.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    let msgCmd = `${OPENCLAW_CLI} message send --channel telegram --target "${TARGET_ID}" --message "${escapedSummary}"`;
    
    if (audio) {
        msgCmd += ` --media "${audio}"`;
    }
    
    console.log("Sending daily lesson via OpenClaw CLI...");
    execSync(msgCmd, { stdio: 'inherit' });
    
    // Update state ONLY if send was successful
    state[today] = { sent: true, date: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log("State updated: Sent.");

} catch (e) {
    console.error("Failed to send message via OpenClaw CLI:", e);
    process.exit(1);
}

// Log for agent parsing (legacy compatibility)
console.log(JSON.stringify({
    action: "send_daily_lesson",
    date: today,
    message: summary,
    audio: audio,
    sent: true
}));
