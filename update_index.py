import os
import re
from datetime import datetime

# Paths
BASE_DIR = "/home/peterchei/.openclaw/workspace/EnglishDaily"
LESSONS_DIR = os.path.join(BASE_DIR, "lessons")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")

def get_lessons():
    lessons = []
    for root, dirs, files in os.walk(LESSONS_DIR):
        for file in files:
            if file.endswith(".md"):
                path = os.path.relpath(os.path.join(root, file), BASE_DIR)
                # Extract date and title
                # Format: vocabulary_YYYY-MM-DD.md
                match = re.search(r"vocabulary_(\d{4}-\d{2}-\d{2})\.md", file)
                if match:
                    date_str = match.group(1)
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                    
                    # Read title from file
                    with open(os.path.join(root, file), 'r') as f:
                        content = f.read()
                        # Extract first word as "title" or just use the date
                        first_word_match = re.search(r"### 1\. (.*) \(", content)
                        title = first_word_match.group(1) if first_word_match else date_str
                    
                    lessons.append({
                        "date": date_str,
                        "display_date": date_obj.strftime("%b %d"),
                        "title": title,
                        "path": f"https://github.com/peterchei/EnglishDaily/blob/main/{path}"
                    })
    
    # Sort lessons by date descending
    lessons.sort(key=lambda x: x['date'], reverse=True)
    return lessons

def generate_index():
    lessons = get_lessons()
    latest = lessons[0] if lessons else None
    
    # Extract details for the latest lesson
    latest_content = ""
    latest_date_full = ""
    audio_file = ""
    if latest:
        latest_date_full = datetime.strptime(latest['date'], "%Y-%m-%d").strftime("%B %d, %Y").upper()
        audio_file = f"media/{latest['date']}_pronunciation.mp3"
        
        # Read the file and parse into HTML
        full_path = os.path.join(BASE_DIR, latest['path'].split('main/')[1])
        with open(full_path, 'r') as f:
            content = f.read()
            
            # Simple parser for the specific markdown format used
            words = re.findall(r"### \d+\. (.*?)\n\*   \*\*Definition:\*\* (.*?)\n\*   \*\*Cantonese Explanation:\*\* (.*?)\n\*   \*\*Pronunciation:\*\* (.*?)\n.*?\n\*   \*\*Example:\*\* \"(.*?)\"\n\*   \*\*Translation:\*\* 「(.*?)」", content, re.DOTALL)
            
            for word_name, definition, cantonese, pron, example, translation in words:
                latest_content += f"""
                <div class="word-item">
                    <div class="word-header">
                        <span class="word-text">{word_name}</span>
                        <span class="word-type"></span>
                        <span class="word-pron">{pron}</span>
                    </div>
                    <p>{definition}</p>
                    <div class="translation">廣東話：{cantonese}</div>
                    <div class="example-box">
                        "{example}"<br>
                        「{translation}」
                    </div>
                </div>"""

    history_html = ""
    for lesson in lessons:
        history_html += f"""
                <li class="history-item">
                    <a href="{lesson['path']}">
                        <span>{lesson['title']}</span>
                        <span class="history-date">{lesson['display_date']}</span>
                    </a>
                </li>"""

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily English Learning Hub 🚀</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg: #0f172a;
            --card-bg: #1e293b;
            --accent: #3b82f6;
            --text: #f1f5f9;
            --subtext: #94a3b8;
            --success: #10b981;
            --funny: #f59e0b;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            line-height: 1.6;
        }}
        .dashboard {{
            max-width: 1000px;
            width: 100%;
        }}
        header {{
            text-align: center;
            margin: 20px 0;
            animation: fadeIn 1s ease-out;
        }}
        h1 {{
            color: var(--accent);
            font-size: 2.2rem;
            margin-bottom: 5px;
        }}
        .stats-bar {{
            display: flex;
            overflow-x: auto;
            gap: 15px;
            margin-bottom: 30px;
            padding-bottom: 10px;
            scrollbar-width: none;
        }}
        .stat-card {{
            background: var(--card-bg);
            padding: 15px;
            border-radius: 16px;
            text-align: center;
            flex: 1;
            min-width: 120px;
            border-bottom: 4px solid var(--accent);
        }}
        .stat-value {{ font-size: 1.5rem; font-weight: bold; color: var(--success); }}
        .stat-label {{ font-size: 0.8rem; color: var(--subtext); }}

        .tabs {{
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }}
        .tab-btn {{
            background: var(--card-bg);
            border: 1px solid var(--accent);
            color: var(--text);
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-family: inherit;
        }}
        .tab-btn.active {{
            background: var(--accent);
            color: white;
        }}

        .content-section {{
            display: none;
            animation: fadeIn 0.5s ease-out;
        }}
        .content-section.active {{
            display: block;
        }}

        .lesson-card {{
            background: var(--card-bg);
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 20px;
            position: relative;
        }}
        .word-item {{
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 1px solid #334155;
        }}
        .word-item:last-child {{ border-bottom: none; }}
        .word-header {{ display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }}
        .word-text {{ font-size: 1.5rem; font-weight: bold; color: #fff; }}
        .word-type {{ color: var(--accent); font-style: italic; font-size: 0.9rem; }}
        .word-pron {{ font-family: monospace; color: var(--success); background: #0004; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; }}
        
        .translation {{ color: var(--subtext); font-size: 0.95rem; margin-top: 5px; margin-bottom: 10px; }}
        .example-box {{ color: var(--subtext); border-left: 3px solid var(--accent); padding-left: 15px; font-style: italic; }}

        .history-list {{ list-style: none; padding: 0; }}
        .history-item {{
            background: var(--card-bg);
            margin-bottom: 10px;
            border-radius: 12px;
            transition: transform 0.2s;
        }}
        .history-item:hover {{ transform: scale(1.02); }}
        .history-item a {{
            padding: 15px 20px;
            color: var(--text);
            text-decoration: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .history-date {{ font-size: 0.8rem; color: var(--subtext); }}

        .mission-item {{
            background: var(--card-bg);
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 15px;
            border-left: 4px solid var(--funny);
        }}

        @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(10px); }} to {{ opacity: 1; transform: translateY(0); }} }}
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
                <div class="stat-value">{len(lessons) * 3}</div>
                <div class="stat-label">Words Learned</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{len(lessons)}</div>
                <div class="stat-label">Daily Streak</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">Active</div>
                <div class="stat-label">Learning Status</div>
            </div>
        </div>

        <div class="tabs">
            <button class="tab-btn active" onclick="showTab('today')">Today</button>
            <button class="tab-btn" onclick="showTab('history')">History</button>
            <button class="tab-btn" onclick="showTab('missions')">Missions</button>
        </div>

        <!-- TODAY SECTION -->
        <div id="today" class="content-section active">
            <div class="section-title">📚 Today's Lesson</div>
            <div class="lesson-card">
                <div style="color: var(--subtext); font-size: 0.8rem; margin-bottom: 20px;">{latest_date_full}</div>
                {latest_content}
                <div class="section-title" style="margin-top: 40px; font-size: 1.2rem;">🔊 Audio Guide</div>
                <audio controls style="width: 100%;">
                    <source src="{audio_file}" type="audio/mpeg">
                </audio>
            </div>
        </div>

        <!-- HISTORY SECTION -->
        <div id="history" class="content-section">
            <div class="section-title">⏳ Previous Lessons</div>
            <ul class="history-list">
                {history_html}
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
            "Welcome to the English Daily Hub! I've updated the page to be more inclusive for everyone. Let's learn together!"
        </div>
    </div>

    <script>
        function showTab(tabId) {{
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            event.currentTarget.classList.add('active');
        }}
    </script>
</body>
</html>
"""
    with open(INDEX_PATH, 'w') as f:
        f.write(html_template)

if __name__ == "__main__":
    generate_index()
