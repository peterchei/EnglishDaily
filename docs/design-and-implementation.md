# EnglishDaily — Design & Implementation Guide

## Overview

EnglishDaily ("Mastering the London Flow") is a self-contained daily English learning system for a Cantonese speaker. It auto-generates lesson content, publishes a PWA dashboard, delivers audio pronunciation guides, and sends a daily Telegram summary — all driven by a single cron job.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   cron (OpenClaw / Linux)                │
│             node check_and_prepare_daily.js              │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────▼──────────────┐
          │  1. Gemini API             │  generates lesson markdown
          │     (gemini-2.0-flash)     │  → lessons/vocabulary_YYYY-MM-DD.md
          └─────────────┬──────────────┘
                        │
          ┌─────────────▼──────────────┐
          │  2. Audio (TTS)            │  generates pronunciation audio
          │     Google TTS → edge-tts │  → media/YYYY-MM-DD_pronunciation.mp3
          │     → skip if both fail   │
          └─────────────┬──────────────┘
                        │
          ┌─────────────▼──────────────┐
          │  3. python update_index.py │  regenerates index.html, README.md,
          │                            │  sw.js, manifest.json
          └─────────────┬──────────────┘
                        │
          ┌─────────────▼──────────────┐
          │  4. git add / commit / push│  deploys to GitHub Pages
          └─────────────┬──────────────┘
                        │
          ┌─────────────▼──────────────┐
          │  5. Telegram Bot API       │  sends text summary to user
          └────────────────────────────┘
```

---

## File Structure

| File / Folder | Purpose |
|---|---|
| `check_and_prepare_daily.js` | Main cron entry point — generates lesson, audio, updates dashboard, pushes to GitHub, sends Telegram |
| `update_index.py` | Regenerates `index.html`, `README.md`, `sw.js`, `manifest.json` from lesson files |
| `lib/lesson-utils.js` | Shared pure functions for TTS script building and Telegram summary parsing |
| `test/` | Unit tests — run with `npm test` |
| `lessons/` | All lesson markdown files (`vocabulary_YYYY-MM-DD.md`, with subfolders `2026-02/`, `Lessons/` for older entries) |
| `media/` | Pronunciation audio (`YYYY-MM-DD_pronunciation.mp3`) |
| `docs/` | Design and implementation documentation |
| `state.json` | Tracks which lessons have been sent (idempotency — prevents duplicate deliveries) |
| `index.html` | Generated PWA dashboard — do not edit manually |
| `sw.js` | Generated service worker — do not edit manually |
| `manifest.json` | Generated PWA manifest — do not edit manually |

---

## Entry Point: check_and_prepare_daily.js

### Idempotency
On every run, the script reads `state.json`. If `state[today].sent === true`, it exits immediately. This prevents duplicate deliveries when cron re-runs.

### Step 1 — Lesson Generation (Gemini API)
- **Model:** `gemini-2.0-flash`
- **API:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=GEMINI_API_KEY`
- **Prompt:** Requests 6-7 British English words/phrases with IPA, definition, Cantonese meaning, and 2 bilingual example sentences each
- **Output:** Saved as `lessons/vocabulary_YYYY-MM-DD.md`
- **Skip condition:** If the lesson file already exists, generation is skipped

### Step 2 — Audio Generation (Google TTS → edge-tts fallback)

Audio is attempted in order. If one method fails, the next is tried. Execution always continues even if all methods fail (audio is optional).

**Method A — Google TTS API** (primary)
- **Voice:** `en-GB-Neural2-B` (British English, Neural)
- **API:** `https://texttospeech.googleapis.com/v1/text:synthesize?key=GEMINI_API_KEY`
- **Output:** Base64-decoded MP3 saved to `media/YYYY-MM-DD_pronunciation.mp3`
- **Failure:** Logs a warning and falls through to edge-tts. Common failure: `API_KEY_SERVICE_BLOCKED` (when the API key is restricted to Gemini only in Google Cloud Console)

**Method B — edge-tts** (fallback)
- **Script:** `EDGE_TTS_SCRIPT` env var, or defaults to `/home/peterchei/.openclaw/workspace/skills/edge-tts/scripts/tts-converter.js`
- **Voice:** `en-GB-RyanNeural`
- **Command:**
  ```bash
  node tts-converter.js "<narration text>" --output media/YYYY-MM-DD_pronunciation.mp3 --voice en-GB-RyanNeural
  ```
- **Failure:** Logs a warning and continues without audio

**Content (both methods):** English-only narration built by `buildTTSScript()` in `lib/lesson-utils.js` — word name, IPA pronunciation, definition, and first example sentence for each word. Cantonese sections are excluded.

**Skip condition:** If the audio file already exists, TTS is skipped entirely.

### Step 3 — Dashboard Update
```bash
python update_index.py
```
Regenerates `index.html`, `README.md`, `sw.js`, and `manifest.json`. The script is run from `__dirname` (script location) so it works on both Linux (OpenClaw) and Windows.

### Step 4 — Git Push
```bash
git add lessons/ media/ lib/ index.html README.md sw.js manifest.json
git commit -m "Daily update: YYYY-MM-DD"
git push
```
Requires git credentials/SSH keys configured in the runtime environment.

### Step 5 — Telegram Delivery
- **API:** `https://api.telegram.org/bot{TOKEN}/sendMessage`
- **Format:** MarkdownV2, text-only (no audio attachment per requirements)
- **Content:** Word list with Cantonese meanings

---

## Dashboard: update_index.py

The Python script regenerates the full static site from lesson markdown files.

| Function | Purpose |
|----------|---------|
| `get_lessons()` | Scans `lessons/` recursively for `*.md` files with a date in the filename |
| `parse_markdown_content(content)` | Converts lesson markdown to HTML word cards |
| `generate_index(lessons)` | Builds `index.html` with inline `LESSONS_DATA` JSON for offline PWA |
| `generate_readme(lessons)` | Updates `README.md` with lesson history |

**Template slots** replaced in `index.html`:
- `{WORDS_COUNT}` — total lessons × 3 (word estimate)
- `{STREAK}` — total lesson count
- `{LESSONS_DATA_JSON}` — last 7 base lessons as JSON (powers swipe navigation)
- `{HISTORY_HTML}` — all lessons as `<li>` links

**Lesson scanning rules:**
- Any `.md` file containing a `YYYY-MM-DD` date pattern in the filename is included
- `_extra` / `_mega` suffixes create variant lessons (excluded from swipe navigation)
- Subfolders like `2026-02/` and `Lessons/` inside `lessons/` are included automatically

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Google AI API key — Gemini lesson generation; also attempted for Google TTS (optional) |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | Yes | Telegram recipient chat ID |
| `EDGE_TTS_SCRIPT` | No | Path to `tts-converter.js`. Defaults to `/home/peterchei/.openclaw/workspace/skills/edge-tts/scripts/tts-converter.js` |

Set these in the OpenClaw cron environment or a `.env` file (not committed).

---

## Cron Setup (OpenClaw / Linux)

```cron
# Run daily at 08:00 server time
0 8 * * * cd /home/peterchei/.openclaw/workspace/EnglishDaily && \
  GEMINI_API_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
  node check_and_prepare_daily.js >> logs/daily.log 2>&1
```

Or export variables in the cron environment file and use:
```cron
0 8 * * * node /home/peterchei/.openclaw/workspace/EnglishDaily/check_and_prepare_daily.js
```

---

## Lesson File Format

```markdown
# Daily English Lesson - YYYY-MM-DD

## 1. **Word** (Part of Speech)
**Pronunciation:** /IPA notation/
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
```

---

## Testing Locally (Windows)

```powershell
# Set environment variables
$env:GEMINI_API_KEY     = "your-key"
$env:TELEGRAM_BOT_TOKEN = "your-bot-token"
$env:TELEGRAM_CHAT_ID   = "your-chat-id"

# Delete today's lesson to force regeneration (optional)
Remove-Item lessons/vocabulary_2026-02-27.md -ErrorAction SilentlyContinue

# Run the script
node check_and_prepare_daily.js
```

Expected outputs:
- `lessons/vocabulary_YYYY-MM-DD.md` — lesson content
- `media/YYYY-MM-DD_pronunciation.mp3` — audio (if TTS API enabled)
- Updated `index.html` (open in browser to verify)
- Telegram message received

> Git push and Telegram steps should be fully tested in the OpenClaw Linux environment.

---

## PWA Dashboard (index.html)

The live app at https://peterchei.github.io/EnglishDaily/ is a vanilla JS single-page app:

- **Today tab:** Swipe-navigable last 7 lessons. Lesson data is embedded inline as `LESSONS_DATA` JSON — no network requests needed (works offline).
- **History tab:** Full lesson list linking to GitHub source files.
- **Missions tab:** Hardcoded practice challenges (in the template inside `update_index.py`).

Navigation: `‹` / `›` arrows and touch swipe both call `navigateLesson(direction)`.
