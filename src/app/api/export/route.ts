import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { ensureDirs, EXPORT_DIR, UPLOAD_DIR, exportPath, publishChannelExport, publishProjectExport } from "@/lib/paths";
import { channelSlug } from "@/lib/channels";
import { isCompatH264, runCommand } from "@/lib/ffmpeg";
import { ensurePillow, whichTools } from "@/lib/bins";
import { resolveSfxDropFile, isDropSfxMediaId } from "@/lib/sfxFolder";
import { resolveMusicDropFile, isMusicDropMediaId } from "@/lib/musicFolder";
import { ffmpegAtempoChain } from "@/lib/defaults";
import type { AspectMode, PlayOrder, TransitionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

/** Widely playable H.264 — avoid yuv444 / High 4:4:4 which many Windows/phone players reject */
const H264_COMPAT = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-profile:v",
  "high",
  "-level",
  "4.1",
] as const;

const AAC_COMPAT = ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"] as const;

const MP4_FASTSTART = ["-movflags", "+faststart"] as const;

interface ExportClip {
  mediaId: string;
  rank: number;
  label: string;
  trimStart: number;
  trimEnd: number;
  segments?: { start: number; end: number; speed?: number }[];
  crop?: { zoom: number; panX: number; panY: number; cropTop?: number; cropBottom?: number; cropLeft?: number; cropRight?: number };
  /** Per-clip gain 0–2; multiplied by body.clipVolume */
  volume?: number;
  /** Playback rate 0.5–2 (1 = normal) */
  speed?: number;
  /** Optional per-clip bed from music/ — capped to this clip's wall duration */
  bedMusic?: {
    mediaId: string;
    startAt?: number;
    volume?: number;
  } | null;
  /** Black hold (seconds) after this clip before the next — overlays stay */
  gapAfter?: number;
}

interface ExportBody {
  clips: ExportClip[];
  title: Record<string, unknown> & {
    barHeight?: number;
    showBar?: boolean;
    enabled?: boolean;
  };
  ranksLayout?: Record<string, unknown>;
  playOrder: PlayOrder;
  transition: TransitionType;
  transitionDuration: number;
  aspectMode: AspectMode;
  blurAmount: number;
  titleOverlap?: boolean;
  showRankList: boolean;
  showActiveLabel: boolean;
  rankColors: Record<string, string>;
  musicMediaId?: string | null;
  musicVolume?: number;
  clipVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
  sticker?: {
    enabled?: boolean;
    mediaId?: string | null;
    scale?: number;
    speed?: number;
    startAt?: number;
    duration?: number;
  } | null;
  /** Channel export naming — preferred over legacy flat ranking-short-N */
  channelExport?: {
    channelSlug: string;
    number: number;
    version: number;
  } | null;
  sfx?: {
    mediaId: string;
    startAt: number;
    trimStart: number;
    trimEnd: number;
    volume: number;
  }[];
}

function resolveMedia(mediaId: string) {
  const clean = mediaId
    .replace(/^\/api\/media\//, "")
    .replace(/^\/api\/sfx\/file\//, "")
    .replace(/^\/api\/music\/file\//, "");
  if (isDropSfxMediaId(clean) || mediaId.includes("/api/sfx/file/")) {
    const name = isDropSfxMediaId(clean)
      ? clean
      : decodeURIComponent(clean);
    const drop = resolveSfxDropFile(name);
    if (drop) return drop;
  }
  // Plain filename that lives in sfx/
  const dropDirect = resolveSfxDropFile(clean);
  if (dropDirect) return dropDirect;

  if (isMusicDropMediaId(clean) || mediaId.includes("/api/music/file/")) {
    const name = isMusicDropMediaId(clean) ? clean : decodeURIComponent(clean);
    const drop = resolveMusicDropFile(name);
    if (drop) return drop;
  }
  const musicDirect = resolveMusicDropFile(clean);
  if (musicDirect) return musicDirect;

  const p = path.join(UPLOAD_DIR, clean);
  if (existsSync(p)) return p;
  const exp = path.join(EXPORT_DIR, clean);
  if (existsSync(exp)) return exp;

  // Bundled / channel subscribe stickers:
  // channel-animals-sticker.webm → public/stickers/channels/animals.webm
  const channelMatch = /^channel-([a-z0-9-]+)-sticker\.webm$/i.exec(clean);
  if (channelMatch) {
    const slug = channelMatch[1];
    const bundled = [
      path.join(process.cwd(), "public", "stickers", "channels", `${slug}.webm`),
      path.join(process.cwd(), "assets", "stickers", "channels", `${slug}.webm`),
    ];
    const hit = bundled.find((cand) => existsSync(cand));
    if (hit) return hit;
  }
  const base = path.basename(clean);
  const publicSticker = path.join(process.cwd(), "public", "stickers", "channels", base);
  if (existsSync(publicSticker)) return publicSticker;

  throw new Error(`Missing media: ${clean}`);
}

/**
 * Cut multiple ranges from one source and concat into a single file.
 * Each part can have its own playback speed (baked in before concat).
 * Parts use ultrafast (accurate cuts) — renderClipSegment re-encodes anyway.
 * Segment cuts run in parallel.
 */
async function buildMergedSource(
  input: string,
  segments: { start: number; end: number; speed?: number }[],
  outPath: string,
  fps: number
) {
  const dir = path.dirname(outPath);
  const parts = await Promise.all(
    segments.map(async (seg, i) => {
      const sourceDur = Math.max(0.2, seg.end - seg.start);
      const speed = Math.max(0.5, Math.min(2, seg.speed ?? 1));
      const part = path.join(dir, `merge-part-${path.basename(outPath)}-${i}.mp4`);
      const vfilter =
        Math.abs(speed - 1) > 0.001
          ? `setpts=PTS/${speed}`
          : "setpts=PTS-STARTPTS";
      const afilter =
        Math.abs(speed - 1) > 0.001
          ? `${ffmpegAtempoChain(speed)},asetpts=PTS-STARTPTS`
          : "asetpts=PTS-STARTPTS";
      await runCommand("ffmpeg", [
        "-y",
        "-ss",
        String(Math.max(0, seg.start)),
        "-t",
        String(sourceDur),
        "-i",
        input,
        "-filter:v",
        vfilter,
        "-filter:a",
        afilter,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(fps),
        ...AAC_COMPAT,
        part,
      ]);
      return part;
    })
  );
  if (parts.length === 1) {
    await runCommand("ffmpeg", ["-y", "-i", parts[0], "-c", "copy", outPath]);
    return;
  }
  const list = path.join(dir, `merge-list-${path.basename(outPath)}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    outPath,
  ]);
}

async function renderClipSegment(opts: {
  input: string;
  output: string;
  trimStart: number;
  /** Source media duration to read (before speed) */
  duration: number;
  /** Wall-clock output duration after speed (defaults to duration) */
  wallDuration?: number;
  /** Clip playback rate 0.5–2 */
  playbackSpeed?: number;
  width: number;
  height: number;
  blurAmount: number;
  aspectMode: AspectMode;
  titleOverlay: string;
  ranksOverlay: string | null;
  stickerPath: string | null;
  stickerScale: number;
  stickerSpeed: number;
  /** Seconds from the start of this clip before the sticker appears */
  stickerDelay: number;
  /** Local clip time when sticker overlay should end */
  stickerEnd: number;
  /** Seek into the sticker source (seconds) when the clip starts mid-sticker */
  stickerSourceSeek: number;
  fps: number;
  clipVolume: number;
  crop?: { zoom: number; panX: number; panY: number; cropTop?: number; cropBottom?: number; cropLeft?: number; cropRight?: number };
  titleOverlap?: boolean;
  titleBarHeight?: number;
  /** Optional bed file mixed under this clip only (capped by wallDuration) */
  bedMusicPath?: string | null;
  bedStartAt?: number;
  bedVolume?: number;
  /** Bake flash/zoom outro into this encode (avoids a second full pass). */
  endTransition?: { type: "flash" | "zoom"; duration: number } | null;
}) {
  const {
    input,
    output,
    trimStart,
    duration,
    wallDuration: wallDurationOpt,
    playbackSpeed = 1,
    width,
    height,
    blurAmount,
    aspectMode,
    titleOverlay,
    ranksOverlay,
    stickerPath,
    stickerScale,
    stickerSpeed,
    stickerDelay,
    stickerEnd: _stickerEnd,
    stickerSourceSeek,
    fps,
    clipVolume,
    crop,
    titleOverlap = true,
    titleBarHeight = 150,
    bedMusicPath = null,
    bedStartAt = 0,
    bedVolume = 0.35,
    endTransition = null,
  } = opts;
  void _stickerEnd;

  const clipSpeed = Math.max(0.5, Math.min(2, playbackSpeed || 1));
  const wallDuration = Math.max(0.2, wallDurationOpt ?? duration / clipSpeed);
  const speedFilter =
    Math.abs(clipSpeed - 1) > 0.001 ? `setpts=PTS/${clipSpeed},` : "";
  const audioTempo =
    Math.abs(clipSpeed - 1) > 0.001 ? `${ffmpegAtempoChain(clipSpeed)},` : "";

  const blur = Math.max(2, Math.min(64, Math.round(blurAmount / 2)));
  const zoom = Math.max(0.25, Math.min(3, crop?.zoom ?? 1));
  const panX = Math.max(0, Math.min(100, crop?.panX ?? 50)) / 100;
  const panY = Math.max(0, Math.min(100, crop?.panY ?? 50)) / 100;
  // Edge crop: paint black bars over the framed output (no punch-zoom).
  // IMPORTANT: never emit drawbox with h=0/w=0 and t=fill — ffmpeg treats that as
  // “fill the entire frame”, which blanks the clip.
  let cropTop = Math.max(0, Math.min(0.45, crop?.cropTop ?? 0));
  let cropBottom = Math.max(0, Math.min(0.45, crop?.cropBottom ?? 0));
  let cropLeft = Math.max(0, Math.min(0.45, crop?.cropLeft ?? 0));
  let cropRight = Math.max(0, Math.min(0.45, crop?.cropRight ?? 0));
  const maxEdgeSum = 0.8;
  if (cropTop + cropBottom > maxEdgeSum) {
    const s = maxEdgeSum / (cropTop + cropBottom);
    cropTop *= s;
    cropBottom *= s;
  }
  if (cropLeft + cropRight > maxEdgeSum) {
    const s = maxEdgeSum / (cropLeft + cropRight);
    cropLeft *= s;
    cropRight *= s;
  }
  const topPad = titleOverlap ? 0 : Math.max(0, Math.round(titleBarHeight));
  const contentH = Math.max(16, height - topPad);
  const topBarPx = Math.floor((contentH * cropTop) / 2) * 2;
  const botBarPx = Math.floor((contentH * cropBottom) / 2) * 2;
  const leftBarPx = Math.floor((width * cropLeft) / 2) * 2;
  const rightBarPx = Math.floor((width * cropRight) / 2) * 2;
  const edgeBarFilters: string[] = [];
  if (topBarPx >= 2) {
    edgeBarFilters.push(`drawbox=x=0:y=0:w=iw:h=${topBarPx}:color=black:t=fill`);
  }
  if (botBarPx >= 2) {
    edgeBarFilters.push(
      `drawbox=x=0:y=ih-${botBarPx}:w=iw:h=${botBarPx}:color=black:t=fill`
    );
  }
  if (leftBarPx >= 2) {
    edgeBarFilters.push(`drawbox=x=0:y=0:w=${leftBarPx}:h=ih:color=black:t=fill`);
  }
  if (rightBarPx >= 2) {
    edgeBarFilters.push(
      `drawbox=x=iw-${rightBarPx}:y=0:w=${rightBarPx}:h=ih:color=black:t=fill`
    );
  }
  const edgeBlackBars = edgeBarFilters.length ? `,${edgeBarFilters.join(",")}` : "";
  const scale = Math.max(0.15, Math.min(1.5, stickerScale || 1));
  const speed = Math.max(0.25, Math.min(3, stickerSpeed || 1));
  const delay = Math.max(0, stickerDelay || 0);

  // Continuous zoom matching preview CSS:
  // 1) speed  2) cover-fit  3) zoom  4) pan overlay on black  5) optional edge black bars
  const padTop =
    topPad > 0 ? `,pad=${width}:${height}:0:${topPad}:black` : "";
  const framed =
    `[0:v]fps=${fps},` +
    speedFilter +
    `scale=${width}:${contentH}:force_original_aspect_ratio=increase,` +
    `scale=iw*${zoom}:ih*${zoom}[czfg];` +
    `color=c=black:s=${width}x${contentH}:r=${fps}:d=${wallDuration}[czbg];` +
    `[czbg][czfg]overlay=x='(W-w)*${panX}':y='(H-h)*${panY}':shortest=1,setsar=1${edgeBlackBars}${padTop}`;

  // Input layout: 0=clip, 1=title, [2=ranks], [2|3=sticker], [n=bed]
  let nextInput = 2;
  const ranksIdx = ranksOverlay ? nextInput++ : -1;
  const stickerIdx = stickerPath ? nextInput++ : -1;
  const bedIdx = bedMusicPath ? nextInput++ : -1;
  const bedVol = Math.max(0, Math.min(1, bedVolume ?? 0.35));
  const bedSeek = Math.max(0, bedStartAt || 0);

  // Match PreviewPhone: fit into (100% × 45% height) with contain, then multiply by scale.
  // Using iw*scale alone makes full-frame WebMs much larger than preview.
  const fitH = Math.max(16, Math.round(height * 0.45));
  const stickFilter =
    stickerIdx >= 0
      ? `[${stickerIdx}:v]format=yuva420p,fps=${fps},` +
        `scale=${width}:${fitH}:force_original_aspect_ratio=decrease,` +
        `scale=iw*${scale}:ih*${scale},` +
        `setpts=PTS/${speed}+${delay}/TB[stk];`
      : "";

  function withOverlays(baseLabel: string) {
    let last = baseLabel;
    const parts: string[] = [];
    if (ranksIdx >= 0) {
      parts.push(`[${last}][${ranksIdx}:v]overlay=0:0:shortest=1[withranks]`);
      last = "withranks";
    }
    parts.push(`[${last}][1:v]overlay=0:0:shortest=1[withtitle]`);
    last = "withtitle";
    const outLabel = endTransition ? "prefx" : "vout";
    if (stickerIdx >= 0) {
      // Start at delay; do NOT hard-end on probed duration (cuts the outro).
      // eof_action=pass lets the WebM finish its transition-out naturally.
      parts.push(
        `[${last}][stk]overlay=x=(W-w)/2:y=H-h:enable='gte(t\\,${delay.toFixed(3)})':eof_action=pass:format=rgb,format=yuv420p[${outLabel}]`
      );
    } else {
      parts.push(`[${last}]format=yuv420p[${outLabel}]`);
    }
    if (endTransition?.type === "flash") {
      const td = Math.min(0.35, Math.max(0.05, endTransition.duration));
      const st = Math.max(0, wallDuration - td);
      parts.push(
        `[prefx]fade=t=out:st=${st}:d=${td}:color=white,format=yuv420p[vout]`
      );
    } else if (endTransition?.type === "zoom") {
      const td = Math.min(0.4, Math.max(0.05, endTransition.duration));
      const st = Math.max(0, wallDuration - td);
      parts.push(
        `[prefx]zoompan=z='if(gte(time,${st}),1+0.35*(time-(${st}))/${td},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},format=yuv420p[vout]`
      );
    }
    return parts.join(";");
  }

  const videoFilter =
    aspectMode === "crop-fill"
      ? [`${framed}[base]`, stickFilter + withOverlays("base")].filter(Boolean).join(";")
      : [
          // Blur bg still fills full frame; FG uses same crop framing + speed
          `[0:v]fps=${fps},${speedFilter}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=${blur},setsar=1[bg]`,
          `${framed}[fg]`,
          topPad > 0
            ? `[bg][fg]overlay=0:${topPad}[comp]`
            : `[bg][fg]overlay=(W-w)/2:(H-h)/2[comp]`,
          stickFilter + withOverlays("comp"),
        ]
          .filter(Boolean)
          .join(";");

  const commonArgs = [
    "-y",
    "-ss",
    String(Math.max(0, trimStart)),
    "-t",
    String(duration),
    "-i",
    input,
    "-loop",
    "1",
    "-t",
    String(wallDuration),
    "-i",
    titleOverlay,
  ];

  if (ranksOverlay) {
    commonArgs.push("-loop", "1", "-t", String(wallDuration), "-i", ranksOverlay);
  }

  if (stickerPath) {
    // Play once (no stream_loop), muted, optionally seek if clip starts mid-sticker.
    // libvpx-vp9 is required to decode VP9 alpha — otherwise transparent gray becomes opaque.
    if (stickerSourceSeek > 0.01) {
      commonArgs.push("-ss", String(stickerSourceSeek));
    }
    const lower = stickerPath.toLowerCase();
    if (lower.endsWith(".webm")) {
      commonArgs.push("-c:v", "libvpx-vp9");
    }
    commonArgs.push("-an", "-i", stickerPath);
  }

  if (bedMusicPath && bedIdx >= 0) {
    // Seek into bed; no loop — amix duration=first + -shortest caps to clip wall length
    if (bedSeek > 0.01) {
      commonArgs.push("-ss", String(bedSeek));
    }
    commonArgs.push("-t", String(wallDuration), "-i", bedMusicPath);
  }

  const encodeArgs = [
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...H264_COMPAT,
    ...AAC_COMPAT,
    "-shortest",
    "-t",
    String(wallDuration),
    "-r",
    String(fps),
    ...MP4_FASTSTART,
    output,
  ];

  const silenceIdx = nextInput;
  const clipAudio = `[0:a]volume=${clipVolume},${audioTempo}aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo`;
  const bedAudio =
    bedIdx >= 0
      ? `[${bedIdx}:a]volume=${bedVol},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[abed]`
      : "";
  const mixedWithBed =
    bedIdx >= 0
      ? `${clipAudio}[aclip];${bedAudio};[aclip][abed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
      : `${clipAudio}[aout]`;

  try {
    await runCommand("ffmpeg", [
      ...commonArgs,
      "-filter_complex",
      `${videoFilter};${mixedWithBed}`,
      ...encodeArgs,
    ]);
  } catch {
    // Silent clip (or audio decode fail): synthesize silence, still mix bed if present
    const silentArgs = [
      ...commonArgs,
      "-f",
      "lavfi",
      "-t",
      String(wallDuration),
      "-i",
      "anullsrc=r=44100:cl=stereo",
    ];
    const silentMix =
      bedIdx >= 0
        ? `${videoFilter};[${silenceIdx}:a]volume=${clipVolume},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aclip];[${bedIdx}:a]volume=${bedVol},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[abed];[aclip][abed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
        : `${videoFilter};[${silenceIdx}:a]volume=${clipVolume},aresample=44100[aout]`;
    await runCommand("ffmpeg", [
      ...silentArgs,
      "-filter_complex",
      silentMix,
      ...encodeArgs,
    ]);
  }
}

/** Black hold between clips — title/ranks stay on; sticker if it overlaps the gap. */
async function renderBlackGapSegment(opts: {
  output: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  titleOverlay: string;
  ranksOverlay: string | null;
  stickerPath: string | null;
  stickerScale: number;
  stickerSpeed: number;
  stickerDelay: number;
  stickerSourceSeek: number;
}) {
  const {
    output,
    duration,
    width,
    height,
    fps,
    titleOverlay,
    ranksOverlay,
    stickerPath,
    stickerScale,
    stickerSpeed,
    stickerDelay,
    stickerSourceSeek,
  } = opts;
  const wallDuration = Math.max(0.05, duration);
  const scale = Math.max(0.15, Math.min(1.5, stickerScale || 1));
  const speed = Math.max(0.25, Math.min(3, stickerSpeed || 1));
  const delay = Math.max(0, stickerDelay || 0);
  const fitH = Math.max(16, Math.round(height * 0.45));

  // Inputs: 0=black, 1=title, [2=ranks], [2|3=sticker], last=silence
  const args: string[] = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${width}x${height}:r=${fps}:d=${wallDuration}`,
    "-loop",
    "1",
    "-t",
    String(wallDuration),
    "-i",
    titleOverlay,
  ];
  let next = 2;
  const ranksIdx = ranksOverlay ? next++ : -1;
  if (ranksOverlay) {
    args.push("-loop", "1", "-t", String(wallDuration), "-i", ranksOverlay);
  }
  const stickerIdx = stickerPath ? next++ : -1;
  if (stickerPath) {
    if (stickerSourceSeek > 0.01) args.push("-ss", String(stickerSourceSeek));
    if (stickerPath.toLowerCase().endsWith(".webm")) args.push("-c:v", "libvpx-vp9");
    args.push("-an", "-i", stickerPath);
  }
  const silenceIdx = next;
  args.push("-f", "lavfi", "-t", String(wallDuration), "-i", "anullsrc=r=44100:cl=stereo");

  const stickFilter =
    stickerIdx >= 0
      ? `[${stickerIdx}:v]format=yuva420p,fps=${fps},` +
        `scale=${width}:${fitH}:force_original_aspect_ratio=decrease,` +
        `scale=iw*${scale}:ih*${scale},` +
        `setpts=PTS/${speed}+${delay}/TB[stk];`
      : "";

  let last = "base";
  const parts: string[] = [`[0:v]setsar=1,format=yuv420p[base]`];
  if (ranksIdx >= 0) {
    parts.push(`[${last}][${ranksIdx}:v]overlay=0:0:shortest=1[withranks]`);
    last = "withranks";
  }
  parts.push(`[${last}][1:v]overlay=0:0:shortest=1[withtitle]`);
  last = "withtitle";
  if (stickerIdx >= 0) {
    parts.push(
      `[${last}][stk]overlay=x=(W-w)/2:y=H-h:enable='gte(t\\,${delay.toFixed(3)})':eof_action=pass:format=rgb,format=yuv420p[vout]`
    );
  } else {
    parts.push(`[${last}]format=yuv420p[vout]`);
  }

  args.push(
    "-filter_complex",
    `${stickFilter}${parts.join(";")}`,
    "-map",
    "[vout]",
    "-map",
    `${silenceIdx}:a`,
    ...H264_COMPAT,
    ...AAC_COMPAT,
    "-shortest",
    "-t",
    String(wallDuration),
    "-r",
    String(fps),
    ...MP4_FASTSTART,
    output
  );

  await runCommand("ffmpeg", args);
}

export async function POST(req: NextRequest) {
  try {
    const tools = whichTools();
    if (!tools.ffmpeg?.ok || !tools.python3?.ok) {
      return NextResponse.json(
        {
          error:
            "Export needs ffmpeg and python3 (Pillow). Windows: winget install Gyan.FFmpeg Python.Python.3.12 then run: python -m pip install pillow",
          tools,
        },
        { status: 500 }
      );
    }

    // Auto-install Pillow into the same Python used for overlay generation
    try {
      ensurePillow();
    } catch (e) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : String(e),
          tools: whichTools(),
        },
        { status: 500 }
      );
    }

    ensureDirs();
    const body = (await req.json()) as ExportBody;
    if (!body.clips?.length) {
      return NextResponse.json({ error: "Add at least one clip before exporting" }, { status: 400 });
    }

    const width = body.width || 1080;
    const height = body.height || 1920;
    const fps = body.fps || 30;
    const jobId = randomUUID();
    const jobDir = path.join(EXPORT_DIR, jobId);
    mkdirSync(jobDir, { recursive: true });

    const ordered = [...body.clips].sort((a, b) =>
      body.playOrder === "countdown" ? b.rank - a.rank : a.rank - b.rank
    );

    const titleCfg = {
      title: body.title,
      ranksLayout: body.ranksLayout || {},
      ranks: ordered.map((c) => ({ rank: c.rank, label: c.label })),
      activeRank: ordered[0]?.rank,
      rankColors: Object.fromEntries(
        Object.entries(body.rankColors || {}).map(([k, v]) => [String(k), v])
      ),
      showActiveLabel: body.showActiveLabel,
    };

    const cfgPath = path.join(jobDir, "overlay.json");
    writeFileSync(cfgPath, JSON.stringify(titleCfg));

    const titleOverlay = path.join(jobDir, "title.png");
    const script = path.join(process.cwd(), "scripts", "generate-overlays.py");

    const stickerEnabled = Boolean(body.sticker?.enabled && body.sticker?.mediaId);
    let stickerPath: string | null = null;
    if (stickerEnabled && body.sticker?.mediaId) {
      try {
        stickerPath = resolveMedia(body.sticker.mediaId);
      } catch {
        stickerPath = null;
      }
    }
    const stickerScale = body.sticker?.scale ?? 0.55;
    const stickerSpeed = body.sticker?.speed ?? 1;
    const stickerStartAt = Math.max(
      0,
      Number.isFinite(body.sticker?.startAt) ? Number(body.sticker?.startAt) : 20
    );
    const stickerDuration =
      Number.isFinite(body.sticker?.duration) && Number(body.sticker?.duration) > 0
        ? Number(body.sticker?.duration)
        : 3;
    const stickerPlayDur = Math.max(0.2, stickerDuration / Math.max(0.25, Math.min(3, stickerSpeed)));

    const segmentPaths: string[] = [];
    let timelineCursor = 0;

    for (let i = 0; i < ordered.length; i++) {
      const clip = ordered[i];
      const ranges =
        clip.segments && clip.segments.length > 0
          ? clip.segments
          : [{ start: clip.trimStart, end: clip.trimEnd, speed: clip.speed ?? 1 }];
      const clipSpeedFallback = Math.max(0.5, Math.min(2, clip.speed ?? 1));
      const ranged = ranges.map((s) => ({
        start: s.start,
        end: s.end,
        speed: Math.max(
          0.5,
          Math.min(2, typeof s.speed === "number" && Number.isFinite(s.speed) ? s.speed : clipSpeedFallback)
        ),
      }));
      const source = resolveMedia(clip.mediaId);
      let input = source;
      let trimStart = ranged[0].start;
      let renderSourceDuration: number;
      let renderWallDuration: number;
      let playbackSpeed: number;

      if (ranged.length > 1) {
        // Bake per-part speed into the merge, then render at 1×
        const merged = path.join(jobDir, `merged-src-${i}.mp4`);
        await buildMergedSource(source, ranged, merged, fps);
        input = merged;
        trimStart = 0;
        renderWallDuration = Math.max(
          0.2,
          ranged.reduce((sum, s) => sum + Math.max(0.2, s.end - s.start) / s.speed, 0)
        );
        renderSourceDuration = renderWallDuration;
        playbackSpeed = 1;
      } else {
        const only = ranged[0];
        trimStart = only.start;
        renderSourceDuration = Math.max(0.2, only.end - only.start);
        playbackSpeed = only.speed;
        renderWallDuration = Math.max(0.2, renderSourceDuration / playbackSpeed);
      }

      // Keep labels for this clip and every earlier clip in playback order
      const ranksOverlay = body.showRankList ? path.join(jobDir, `ranks-${i}.png`) : null;
      const perCfg = {
        ...titleCfg,
        activeRank: clip.rank,
        showActiveLabel: body.showActiveLabel !== false,
        ranks: ordered.map((c, idx) => ({
          rank: c.rank,
          // Progressive reveal: once a rank plays, its name stays on later clips
          label:
            body.showActiveLabel === false
              ? ""
              : idx <= i
                ? c.label || ""
                : "",
        })),
      };
      const perCfgPath = path.join(jobDir, `overlay-${i}.json`);
      writeFileSync(perCfgPath, JSON.stringify(perCfg));

      await runCommand("python3", [
        script,
        "--config",
        perCfgPath,
        "--title-out",
        titleOverlay,
        "--ranks-out",
        ranksOverlay || path.join(jobDir, `ranks-unused-${i}.png`),
      ]);

      const seg = path.join(jobDir, `seg-${i}.mp4`);
      const titleEnabled = body.title?.enabled !== false;
      const barH = !titleEnabled
        ? 0
        : typeof body.title?.barHeight === "number"
          ? body.title.barHeight
          : body.title?.showBar === false
            ? 0
            : 150;

      const clipAbsStart = timelineCursor;
      const stickerAbsEnd = stickerStartAt + stickerPlayDur;
      const clipAbsEnd = clipAbsStart + renderWallDuration;
      const stickerOverlaps =
        Boolean(stickerPath) &&
        stickerAbsEnd > clipAbsStart + 0.01 &&
        stickerStartAt < clipAbsEnd - 0.01;
      const stickerDelay = stickerOverlaps
        ? Math.max(0, stickerStartAt - clipAbsStart)
        : 0;
      const stickerEndLocal = stickerOverlaps
        ? Math.min(renderWallDuration, stickerAbsEnd - clipAbsStart)
        : 0;
      const stickerSourceSeek =
        stickerOverlaps && clipAbsStart > stickerStartAt
          ? Math.max(0, (clipAbsStart - stickerStartAt) * Math.max(0.25, Math.min(3, stickerSpeed)))
          : 0;

      let bedMusicPath: string | null = null;
      let bedStartAt = 0;
      let bedVolume = 0.35;
      if (clip.bedMusic?.mediaId) {
        try {
          bedMusicPath = resolveMedia(clip.bedMusic.mediaId);
          bedStartAt = Math.max(0, clip.bedMusic.startAt ?? 0);
          bedVolume = Math.max(0, Math.min(1, clip.bedMusic.volume ?? 0.35));
        } catch {
          bedMusicPath = null;
        }
      }

      const wantsEndFx =
        (body.transition === "flash" || body.transition === "zoom") &&
        i < ordered.length - 1;
      await renderClipSegment({
        input,
        output: seg,
        trimStart: ranged.length > 1 ? 0 : trimStart,
        duration: renderSourceDuration,
        wallDuration: renderWallDuration,
        playbackSpeed,
        width,
        height,
        blurAmount: body.blurAmount ?? 28,
        aspectMode: body.aspectMode || "crop-fill",
        titleOverlay,
        ranksOverlay: body.showRankList ? ranksOverlay : null,
        stickerPath: stickerOverlaps ? stickerPath : null,
        stickerScale,
        stickerSpeed,
        stickerDelay,
        stickerEnd: stickerEndLocal,
        stickerSourceSeek,
        fps,
        clipVolume: Math.max(
          0,
          Math.min(2, (clip.volume ?? 1) * (body.clipVolume ?? 1))
        ),
        crop: clip.crop || {
          zoom: 1,
          panX: 50,
          panY: 50,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
        },
        titleOverlap: !titleEnabled ? true : body.titleOverlap !== false,
        titleBarHeight: barH,
        bedMusicPath,
        bedStartAt,
        bedVolume,
        endTransition: wantsEndFx
          ? {
              type: body.transition as "flash" | "zoom",
              duration: body.transitionDuration || 0.25,
            }
          : null,
      });

      timelineCursor += renderWallDuration;
      segmentPaths.push(seg);

      // Black hold between clips (overlays from this clip's progressive ranks stay on)
      const gapAfter = Math.max(
        0,
        Math.min(10, Number.isFinite(clip.gapAfter) ? Number(clip.gapAfter) : 0)
      );
      if (gapAfter > 0.05 && i < ordered.length - 1) {
        const gapPath = path.join(jobDir, `gap-${i}.mp4`);
        const gapAbsStart = timelineCursor;
        const gapAbsEnd = timelineCursor + gapAfter;
        const stickerOverlapsGap =
          stickerEnabled &&
          stickerAbsEnd > gapAbsStart + 0.01 &&
          stickerStartAt < gapAbsEnd - 0.01;
        const gapStickerDelay = Math.max(0, stickerStartAt - gapAbsStart);
        const gapStickerSeek =
          gapAbsStart > stickerStartAt
            ? Math.max(0, (gapAbsStart - stickerStartAt) * Math.max(0.25, Math.min(3, stickerSpeed)))
            : 0;
        await renderBlackGapSegment({
          output: gapPath,
          duration: gapAfter,
          width,
          height,
          fps,
          titleOverlay,
          ranksOverlay: body.showRankList ? ranksOverlay : null,
          stickerPath: stickerOverlapsGap ? stickerPath : null,
          stickerScale,
          stickerSpeed,
          stickerDelay: gapStickerDelay,
          stickerSourceSeek: gapStickerSeek,
        });
        segmentPaths.push(gapPath);
        timelineCursor += gapAfter;
      }
    }

    // Concat demuxer
    const listPath = path.join(jobDir, "list.txt");
    writeFileSync(
      listPath,
      segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
    );

    const concatOut = path.join(jobDir, "concat.mp4");
    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      concatOut,
    ]);

    const finalOut = exportPath(jobId);
    const sfxList = (body.sfx || []).filter(
      (s) => s.mediaId && s.trimEnd > s.trimStart && s.startAt >= 0
    );
    const hasMusic = Boolean(body.musicMediaId);
    const needsMix = hasMusic || sfxList.length > 0;

    if (!needsMix) {
      // Segments already use H264_COMPAT (yuv420p High). Prefer remux — huge win.
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        concatOut,
        "-c",
        "copy",
        ...MP4_FASTSTART,
        finalOut,
      ]);
      if (!(await isCompatH264(finalOut))) {
        await runCommand("ffmpeg", [
          "-y",
          "-i",
          concatOut,
          "-vf",
          "format=yuv420p",
          ...H264_COMPAT,
          ...AAC_COMPAT,
          ...MP4_FASTSTART,
          finalOut,
        ]);
      }
    } else {
      const args: string[] = ["-y", "-i", concatOut];
      let inputIdx = 1;
      const filterParts: string[] = [];
      const mixInputs: string[] = ["[a0]"];

      filterParts.push(`[0:a]volume=1,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]`);

      if (hasMusic && body.musicMediaId) {
        const music = resolveMedia(body.musicMediaId);
        const vol = body.musicVolume ?? 0.35;
        args.push("-stream_loop", "-1", "-i", music);
        filterParts.push(
          `[${inputIdx}:a]volume=${vol},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[am]`
        );
        mixInputs.push("[am]");
        inputIdx += 1;
      }

      for (const sfx of sfxList) {
        const pathSfx = resolveMedia(sfx.mediaId);
        const trimDur = Math.max(0.05, sfx.trimEnd - sfx.trimStart);
        const delayMs = Math.max(0, Math.round(sfx.startAt * 1000));
        const vol = Math.max(0, Math.min(3, sfx.volume ?? 1));
        args.push("-i", pathSfx);
        filterParts.push(
          `[${inputIdx}:a]atrim=start=${sfx.trimStart}:duration=${trimDur},asetpts=PTS-STARTPTS,volume=${vol},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${delayMs}|${delayMs}[s${inputIdx}]`
        );
        mixInputs.push(`[s${inputIdx}]`);
        inputIdx += 1;
      }

      const n = mixInputs.length;
      filterParts.push(
        `${mixInputs.join("")}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0[aout]`
      );

      // Keep segment video bitstream; only re-encode the mixed audio.
      args.push(
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        ...AAC_COMPAT,
        "-shortest",
        ...MP4_FASTSTART,
        finalOut
      );

      try {
        await runCommand("ffmpeg", args);
      } catch {
        // If base has no audio, synthesize silence bed then mix (still copy video)
        const silentArgs: string[] = [
          "-y",
          "-i",
          concatOut,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo",
        ];
        let idx = 2;
        const parts: string[] = [
          `[1:a]atrim=0:3600,asetpts=PTS-STARTPTS,volume=0.001[a0]`,
        ];
        const mixes = ["[a0]"];
        if (hasMusic && body.musicMediaId) {
          silentArgs.push("-stream_loop", "-1", "-i", resolveMedia(body.musicMediaId));
          parts.push(
            `[${idx}:a]volume=${body.musicVolume ?? 0.35},aresample=44100[am]`
          );
          mixes.push("[am]");
          idx += 1;
        }
        for (const sfx of sfxList) {
          silentArgs.push("-i", resolveMedia(sfx.mediaId));
          const trimDur = Math.max(0.05, sfx.trimEnd - sfx.trimStart);
          const delayMs = Math.max(0, Math.round(sfx.startAt * 1000));
          parts.push(
            `[${idx}:a]atrim=start=${sfx.trimStart}:duration=${trimDur},asetpts=PTS-STARTPTS,volume=${sfx.volume ?? 1},adelay=${delayMs}|${delayMs}[s${idx}]`
          );
          mixes.push(`[s${idx}]`);
          idx += 1;
        }
        parts.push(
          `${mixes.join("")}amix=inputs=${mixes.length}:duration=first:dropout_transition=0:normalize=0[aout]`
        );
        const silentFilter = parts.join(";");
        const silentMap = [
          "-filter_complex",
          silentFilter,
          "-map",
          "0:v",
          "-map",
          "[aout]",
        ] as const;
        try {
          await runCommand("ffmpeg", [
            ...silentArgs,
            ...silentMap,
            "-c:v",
            "copy",
            ...AAC_COMPAT,
            "-shortest",
            ...MP4_FASTSTART,
            finalOut,
          ]);
        } catch {
          // Last resort: full re-encode (rare codec/container edge cases)
          await runCommand("ffmpeg", [
            ...silentArgs,
            ...silentMap,
            ...H264_COMPAT,
            ...AAC_COMPAT,
            "-shortest",
            ...MP4_FASTSTART,
            finalOut,
          ]);
        }
      }
    }

    const published =
      body.channelExport &&
      body.channelExport.channelSlug &&
      Number.isFinite(body.channelExport.number) &&
      body.channelExport.number >= 1
        ? publishChannelExport(finalOut, {
            channelSlug: channelSlug(body.channelExport.channelSlug),
            number: Math.floor(body.channelExport.number),
            version: Math.max(1, Math.floor(body.channelExport.version || 1)),
          })
        : (() => {
            const legacy = publishProjectExport(finalOut);
            return {
              ...legacy,
              version: 1,
              channelSlug: "",
              downloadId: legacy.fileName,
            };
          })();

    return NextResponse.json({
      exportId: published.fileName,
      fileName: published.fileName,
      exportNumber: published.number,
      exportVersion: "version" in published ? published.version : 1,
      channelSlug: "channelSlug" in published ? published.channelSlug : "",
      /** Saved on disk under the project exports/ folder */
      savedPath: published.relativePath,
      downloadUrl: `/api/media/${encodeURIComponent(
        "downloadId" in published && published.downloadId
          ? published.downloadId
          : published.fileName
      )}?download=1`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    console.error("export error", message);
    return NextResponse.json({ error: message.slice(0, 600) }, { status: 500 });
  }
}
