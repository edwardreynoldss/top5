# RankShorts

Create **Top 5 ranking** YouTube Shorts / TikTok / Reels videos in the browser — CapCut-style template with editable title (fonts, multi-color words, 2 lines, placement), blurred vertical fill, persistent rank list, clip trimming, drag-to-reorder, and MP4 export.

## Requirements (Windows)

Install these tools first. Missing `ffmpeg` causes `spawn ffmpeg ENOENT`.

### 1. Node.js
https://nodejs.org (LTS) — includes `npm`.

### 2. FFmpeg, yt-dlp, Python (recommended: winget)

Open **PowerShell** and run:

```powershell
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp
winget install Python.Python.3.12
```

Close PowerShell, open a **new** window, then:

```powershell
python -m pip install -U pillow yt-dlp
# or from the project folder:
npm run setup:python
```

Export will also **auto-install Pillow** into your Python if it’s missing when you click Export.

### 3. Verify

```powershell
ffmpeg -version
ffprobe -version
yt-dlp --version
python --version
python -c "import PIL; print('pillow ok')"
```

If a command is “not recognized”, log out/in (or reboot) so PATH updates, or set full paths:

```powershell
$env:FFMPEG_PATH="C:\Program Files\ffmpeg\bin\ffmpeg.exe"
$env:FFPROBE_PATH="C:\Program Files\ffmpeg\bin\ffprobe.exe"
$env:YT_DLP_PATH="C:\Users\YOU\AppData\Local\Microsoft\WinGet\Links\yt-dlp.exe"
$env:PYTHON_PATH="C:\Users\YOU\AppData\Local\Programs\Python\Python312\python.exe"
```

### Alternative installs
- **Chocolatey:** `choco install ffmpeg yt-dlp python`
- **Scoop:** `scoop install ffmpeg yt-dlp python`

## Setup

```powershell
npm install
npm run dev
```

Open http://localhost:3000 — the top bar should say **Tools OK**.

## Workflow

1. Customize title words/colors (1–2 lines), font, size, and X/Y placement
2. Move rank numbers with the ranks placement sliders
3. Paste a YouTube / TikTok / Instagram link **or upload** a file → trim → confirm
4. Drag clips to reorder
5. Preview, then Export MP4 — files save to `exports/ranking-short-1.mp4`, `ranking-short-2.mp4`, … and download automatically

## Link downloads

YouTube / TikTok often require browser cookies. If fetch fails in PowerShell:

```powershell
$env:YT_DLP_COOKIES_FROM_BROWSER="chrome"   # or firefox / edge
npm run dev
```

Or download the clip in the app and **upload the MP4** (always works).

## Other OS (optional)

```bash
# macOS
brew install ffmpeg yt-dlp && pip3 install pillow

# Ubuntu
sudo apt install ffmpeg && pip3 install -U yt-dlp pillow
```
