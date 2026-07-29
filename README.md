# RankShorts

Create **Top 5 ranking** YouTube Shorts / TikTok / Reels videos in the browser — the CapCut-style template with a customizable title, blurred vertical fill, persistent rank list, clip trimming, drag-to-reorder, and MP4 export.

## Why this editor

Viral ranking Shorts usually share the same recipe:

1. **9:16 canvas** (1080×1920)
2. Landscape clip **centered** with a **blurred copy** filling the letterbox (not black bars)
3. A **title bar** with one neon highlight word
4. A **persistent 1–5 list** on the left; the active label pops beside the current rank
5. Clips play in **countdown order (#5 → #1)** with punchy transitions so viewers stay for #1

RankShorts implements that pipeline with a live preview that matches what FFmpeg burns into the export.

## Features

- Paste **YouTube / TikTok / Instagram** links (via `yt-dlp`) or **upload** video files
- **Trim UI** with playable preview before a clip is inserted
- **Drag-and-drop reorder** of the five slots
- Fully customizable title (prefix / highlight / suffix + color)
- Rank colors, blur strength, crop vs blur-pad, flash/zoom/cut transitions
- Optional background music bed mixed on export
- Server-side **FFmpeg** export → downloadable MP4

## Requirements

- Node.js 20+
- `ffmpeg` + `ffprobe` on PATH
- `yt-dlp` on PATH (for link import)
- Python 3 + Pillow (`pip install pillow`) for overlay rendering

## Setup

```bash
npm install
pip install pillow yt-dlp
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Workflow

1. Set your title (e.g. `RANKING BEST` + `SKATE` + `FAILS`)
2. For each rank: paste a link or upload → trim the moment → confirm
3. Drag clips if you want a different order
4. Hit **Preview**, then **Export MP4**

## Notes on social links

Some TikTok/Instagram posts require login cookies and may fail to download. Uploading the file you already saved always works.
