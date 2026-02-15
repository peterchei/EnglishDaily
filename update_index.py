import os
import re
import time
from datetime import datetime

# Paths
BASE_DIR = "/home/peterchei/.openclaw/workspace/EnglishDaily"
LESSONS_DIR = os.path.join(BASE_DIR, "lessons")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")
README_PATH = os.path.join(BASE_DIR, "README.md")
SW_PATH = os.path.join(BASE_DIR, "sw.js")
MANIFEST_PATH = os.path.join(BASE_DIR, "manifest.json")

def get_lessons():
    lessons = []
    for root, dirs, files in os.walk(LESSONS_DIR):
        for file in files:
            if file.endswith(".md"):
                path = os.path.relpath(os.path.join(root, file), BASE_DIR)
                match = re.search(r"vocabulary_(\d{4}-\d{2}-\d{2})(.*)\.md", file)
                if match:
                    date_str = match.group(1)
                    suffix = match.group(2)
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                    
                    with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                        content = f.read()
                        name_match = re.search(r"\d+\.\s+\*\*(.*?)\*\*", content)
                        title = name_match.group(1) if name_match else date_str
                        if suffix == "_extra":
                            title = f"Extra: {title}"
                            display_suffix = " (Extra)"
                        elif suffix == "_mega":
                            title = f"Mega: {title}"
                            display_suffix = " (Mega)"
                        else:
                            display_suffix = ""
                    
                    lessons.append({
                        "date": date_str + suffix,
                        "sort_key": date_str + suffix,
                        "display_date": date_obj.strftime("%b %d") + display_suffix,
                        "title": title,
                        "path": path
                    })
    
    lessons.sort(key=lambda x: x['sort_key'], reverse=True)
    return lessons

def parse_markdown_content(content):
    blocks = re.split(r'\n(?=\d+\.\s+\*\*)', content)
    blocks = [b for b in blocks if re.search(r'\d+\.\s+\*\*', b)]
    
    html_output = ""
    for block in blocks:
        name_match = re.search(r"\d+\.\s+\*\*(.*?)\*\*", block)
        word_name = name_match.group(1) if name_match else "Word"
        
        type_match = re.search(r"\((.*?)\)", block)
        word_type = type_match.group(1) if type_match else ""
        
        def get_val(label):
            m = re.search(rf"\*\*{label}\*\*[:：]\s*(.*)", block, re.IGNORECASE)
            return m.group(1).strip() if m else ""

        definition = get_val(r"(?:Definition|Meaning)")
        cantonese = get_val(r"(?:Cantonese Explanation|Cantonese)")
        pronunciation = get_val(r"Pronunciation")
        example = get_val(r"Example")
        translation = get_val(r"(?:Translation|Cantonese Example)")
        
        html_output += f"""
                <div class="word-item">
                    <div class="word-header">
                        <span class="word-text">{word_name}</span>
                        <span class="word-type">({word_type})</span>
                        <span class="word-pron">{pronunciation}</span>
                    </div>
                    <p>{definition}</p>
                    <div class="translation">廣東話：{cantonese}</div>
                    <div class="example-box">
                        {example}<br>
                        {translation}
                    </div>
                </div>"""
    return html_output

def generate_index(lessons):
    latest = lessons[0] if lessons else None
    
    latest_content = ""
    latest_date_full = ""
    audio_file = ""
    if latest:
        latest_date_full = datetime.strptime(latest['date'][:10], "%Y-%m-%d").strftime("%B %d, %Y").upper()
        if "_extra" in latest['date']:
            latest_date_full += " (EXTRA SESSION)"
        elif "_mega" in latest['date']:
            latest_date_full += " (MEGA SESSION)"
        audio_file = f"media/{latest['date']}_pronunciation.mp3"
        
        full_path = os.path.join(BASE_DIR, latest['path'])
        with open(full_path, 'r', encoding='utf-8') as f:
            latest_content = parse_markdown_content(f.read())

    history_html = ""
    for lesson in lessons:
        history_html += f"""
                <li class="history-item">
                    <a href="https://github.com/peterchei/EnglishDaily/blob/main/{lesson['path']}">
                        <span>{lesson['title']}</span>
                        <span class="history-date">{lesson['display_date']}</span>
                    </a>
                </li>"""

    html_template = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily English Learning Hub 🚀</title>
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="icon.png">
    <meta name="theme-color" content="#3b82f6">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card-bg: #1e293b;
            --accent: #3b82f6;
            --text: #f1f5f9;
            --subtext: #94a3b8;
            --success: #10b981;
            --funny: #f59e0b;
        }
        * { box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            line-height: 1.6;
        }
        .dashboard {
            max-width: 1000px;
            width: 100%;
        }
        header {
            text-align: center;
            margin: 20px 0;
            animation: fadeIn 1s ease-out;
        }
        h1 {
            color: var(--accent);
            font-size: 2.2rem;
            margin-bottom: 5px;
        }
        .stats-bar {
            display: flex;
            overflow-x: auto;
            gap: 15px;
            margin-bottom: 30px;
            padding-bottom: 10px;
            scrollbar-width: none;
        }
        .stat-card {
            background: var(--card-bg);
            padding: 15px;
            border-radius: 16px;
            text-align: center;
            flex: 1;
            min-width: 120px;
            border-bottom: 4px solid var(--accent);
        }
        .stat-value { font-size: 1.5rem; font-weight: bold; color: var(--success); }
        .stat-label { font-size: 0.8rem; color: var(--subtext); }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .tab-btn {
            background: var(--card-bg);
            border: 1px solid var(--accent);
            color: var(--text);
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-family: inherit;
        }
        .tab-btn.active {
            background: var(--accent);
            color: white;
        }

        .content-section {
            display: none;
            animation: fadeIn 0.5s ease-out;
        }
        .content-section.active {
            display: block;
        }

        .lesson-card {
            background: var(--card-bg);
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 20px;
            position: relative;
        }
        .word-item {
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 1px solid #334155;
        }
        .word-item:last-child { border-bottom: none; }
        .word-header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .word-text { font-size: 1.5rem; font-weight: bold; color: #fff; }
        .word-type { color: var(--accent); font-style: italic; font-size: 0.9rem; }
        .word-pron { font-family: monospace; color: var(--success); background: #0004; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; }
        
        .translation { color: var(--subtext); font-size: 0.95rem; margin-top: 5px; margin-bottom: 10px; }
        .example-box { color: var(--subtext); border-left: 3px solid var(--accent); padding-left: 15px; font-style: italic; }

        .history-list { list-style: none; padding: 0; }
        .history-item {
            background: var(--card-bg);
            margin-bottom: 10px;
            border-radius: 12px;
            transition: transform 0.2s;
        }
        .history-item:hover { transform: scale(1.02); }
        .history-item a {
            padding: 15px 20px;
            color: var(--text);
            text-decoration: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .history-date { font-size: 0.8rem; color: var(--subtext); }

        .mission-item {
            background: var(--card-bg);
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 15px;
            border-left: 4px solid var(--funny);
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="dashboard">
        <header>
            <h1>🚀 English Level Up</h1>
            <p style="color: var(--subtext)">Daily Progress Hub</p>
        </header>

        <div class="stats-bar">
            <div class="stat-card">
                <div class="stat-value">{WORDS_COUNT}</div>
                <div class="stat-label">Words Learned</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{STREAK}</div>
                <div class="stat-label">Daily Streak</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">Active</div>
                <div class="stat-label">Learning Status</div>
            </div>
        </div>

        <div class="tabs">
            <button class="tab-btn active" onclick="showTab('today', event)">Today</button>
            <button class="tab-btn" onclick="showTab('history', event)">History</button>
            <button class="tab-btn" onclick="showTab('missions', event)">Missions</button>
        </div>

        <!-- TODAY SECTION -->
        <div id="today" class="content-section active">
            <div class="section-title">📚 Today's Lesson</div>
            <div class="lesson-card">
                <div style="color: var(--subtext); font-size: 0.8rem; margin-bottom: 20px;">{LATEST_DATE}</div>
                {LATEST_CONTENT}
                <div class="section-title" style="margin-top: 40px; font-size: 1.2rem;">🔊 Audio Guide</div>
                <audio controls style="width: 100%;">
                    <source src="{AUDIO_FILE}" type="audio/mpeg">
                </audio>
            </div>
        </div>

        <!-- HISTORY SECTION -->
        <div id="history" class="content-section">
            <div class="section-title">⏳ Previous Lessons</div>
            <ul class="history-list">
                {HISTORY_HTML}
            </ul>
        </div>

        <!-- MISSIONS SECTION -->
        <div id="missions" class="content-section">
            <div class="section-title">🎯 Your Missions</div>
            <div class="mission-item">
                <b>Active</b>: Use "perilous" in a voice note.
            </div>
            <div class="mission-item" style="opacity: 0.5">
                <b>Completed</b>: Use "straightforward".
            </div>
        </div>

        <div class="agent-note" style="margin-top: 20px;">
            <b>Little Pretty A:</b><br>
            "Welcome to the English Daily Hub! Let's learn together!"
        </div>
    </div>

    <script>
        function showTab(tabId, event) {
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const activeTab = document.getElementById(tabId);
            if (activeTab) {
                activeTab.classList.add('active');
            }
            if (event) {
                event.currentTarget.classList.add('active');
            }
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service worker registered!', reg))
                    .catch(err => console.log('Service worker registration failed: ', err));
            });
        }
    </script>
</body>
</html>
"""
    html_output = html_template.replace("{WORDS_COUNT}", str(len(lessons) * 3))
    html_output = html_output.replace("{STREAK}", str(len(lessons)))
    html_output = html_output.replace("{LATEST_DATE}", latest_date_full)
    html_output = html_output.replace("{LATEST_CONTENT}", latest_content)
    html_output = html_output.replace("{AUDIO_FILE}", audio_file)
    html_output = html_output.replace("{HISTORY_HTML}", history_html)

    with open(INDEX_PATH, 'w') as f:
        f.write(html_output)

def generate_readme(lessons):
    latest_date = lessons[0]['date'] if lessons else datetime.now().strftime("%Y-%m-%d")
    streak = len(lessons)
    
    history_md = ""
    for lesson in lessons:
        history_md += f"- **[{lesson['display_date']}: {lesson['title']}]({lesson['path']})**\n"

    readme_content = f"""# English Learning Journey 🚀
### "Mastering the London Flow"

Welcome to this daily English growth journal. This repository is managed by **Little Pretty A ✨** to track progress, store learning materials, and share knowledge with friends.

---

## 📱 Access the Web App
Scan the QR code below to access the live dashboard on your phone:

![QR Code](media/qrcode.png)

[Open Web App](https://peterchei.github.io/EnglishDaily/)

---

## 📊 Progress Dashboard
- **Current Focus:** 🇬🇧 London Workplace & Social Idioms
- **Daily Streak:** 🔥 {streak} Days
- **Last Updated:** {latest_date}

## 📅 Monthly Lessons
### 2026 February
{history_md}

---
*“Success is the sum of small efforts, repeated day in and day out.”*
"""
    with open(README_PATH, 'w') as f:
        f.write(readme_content)

if __name__ == "__main__":
    lessons = get_lessons()
    generate_index(lessons)
    generate_readme(lessons)
    
    # Update manifest to use SVG
    manifest = """{
  "name": "English Daily Hub",
  "short_name": "EngDaily",
  "description": "Daily English Learning Journey",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}"""
    with open(MANIFEST_PATH, 'w') as f:
        f.write(manifest)

    # Update Service Worker
    sw_version = int(time.time())
    sw_content = f"const CACHE_NAME = 'eng-daily-v{sw_version}';\\nconst ASSETS = [\\n  './index.html',\\n  './manifest.json',\\n  './icon.svg'\\n];\\n\\nself.addEventListener('install', (event) => {{\\n  event.waitUntil(\\n    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))\\n  );\\n}});\\n\\nself.addEventListener('fetch', (event) => {{\\n  event.respondWith(\\n    caches.match(event.request).then((response) => {{\\n      return response || fetch(event.request);\\n    }})\\n  );\\n}});"
    with open(SW_PATH, 'w') as f:
        f.write(sw_content.replace('\\\\n', '\\n'))
