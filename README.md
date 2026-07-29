# RankShorts

Create **Top 5 ranking** YouTube Shorts / TikTok / Reels videos in the browser — CapCut-style template with editable title (fonts, multi-color words, 2 lines, placement), blurred vertical fill, persistent rank list, clip trimming, drag-to-reorder, and MP4 export.

## Requirements

Install these on your machine first (this fixes `spawn ffmpeg ENOENT`):

```bash
# macOS
brew install ffmpeg yt-dlp
pip3 install pillow

# Ubuntu / Debian
sudo apt install ffmpeg
pip3 install -U yt-dlp pillow
```

Optional overrides if binaries are not on PATH:

```bash
export FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
export FFPROBE_PATH=/opt/homebrew/bin/ffprobe
export YT_DLP_PATH=/opt/homebrew/bin/yt-dlp
```

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The top bar shows **Tools OK** when ffmpeg / yt-dlp / python3 are detected (`/api/health`).

## Workflow

1. Customize title words/colors (1–2 lines), font, size, and X/Y placement
2. Move rank numbers with the ranks placement sliders
3. Paste a YouTube / TikTok / Instagram link **or upload** a file → trim → confirm
4. Drag clips to reorder
5. Preview, then Export MP4

## Link downloads

YouTube / TikTok often require browser cookies now. If fetch fails:

```bash
export YT_DLP_COOKIES_FROM_BROWSER=chrome   # or safari / firefox
npm run dev
```

Or download the clip in the app and **upload the file** (always works).
