import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { ensureDirs, EXPORT_DIR, UPLOAD_DIR, exportPath } from "@/lib/paths";
import { runCommand } from "@/lib/ffmpeg";
import { whichTools } from "@/lib/bins";
import type { AspectMode, PlayOrder, TransitionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

interface ExportClip {
  mediaId: string;
  rank: number;
  label: string;
  trimStart: number;
  trimEnd: number;
  segments?: { start: number; end: number }[];
  crop?: { zoom: number; panX: number; panY: number };
}

interface ExportBody {
  clips: ExportClip[];
  title: Record<string, unknown> & { barHeight?: number; showBar?: boolean };
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
}

function resolveMedia(mediaId: string) {
  const clean = mediaId.replace(/^\/api\/media\//, "");
  const p = path.join(UPLOAD_DIR, clean);
  if (!existsSync(p)) throw new Error(`Missing media: ${clean}`);
  return p;
}

/** Cut multiple ranges from one source and concat into a single file */
async function buildMergedSource(
  input: string,
  segments: { start: number; end: number }[],
  outPath: string,
  fps: number
) {
  const parts: string[] = [];
  const dir = path.dirname(outPath);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = Math.max(0.2, seg.end - seg.start);
    const part = path.join(dir, `merge-part-${path.basename(outPath)}-${i}.mp4`);
    await runCommand("ffmpeg", [
      "-y",
      "-ss",
      String(Math.max(0, seg.start)),
      "-t",
      String(dur),
      "-i",
      input,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-r",
      String(fps),
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      part,
    ]);
    parts.push(part);
  }
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
  duration: number;
  width: number;
  height: number;
  blurAmount: number;
  aspectMode: AspectMode;
  titleOverlay: string;
  ranksOverlay: string | null;
  fps: number;
  clipVolume: number;
  crop?: { zoom: number; panX: number; panY: number };
  titleOverlap?: boolean;
  titleBarHeight?: number;
}) {
  const {
    input,
    output,
    trimStart,
    duration,
    width,
    height,
    blurAmount,
    aspectMode,
    titleOverlay,
    ranksOverlay,
    fps,
    clipVolume,
    crop,
    titleOverlap = true,
    titleBarHeight = 150,
  } = opts;

  const blur = Math.max(2, Math.min(64, Math.round(blurAmount / 2)));
  const zoom = Math.max(1, Math.min(3, crop?.zoom ?? 1));
  const panX = Math.max(0, Math.min(100, crop?.panX ?? 50)) / 100;
  const panY = Math.max(0, Math.min(100, crop?.panY ?? 50)) / 100;
  const topPad = titleOverlap ? 0 : Math.max(0, Math.round(titleBarHeight));
  const contentH = Math.max(16, height - topPad);

  // Cover content area, apply zoom, then crop with pan offsets
  const coverScale = `scale=${width}:${contentH}:force_original_aspect_ratio=increase`;
  const zoomScale =
    zoom > 1.001
      ? `,scale=iw*${zoom}:ih*${zoom}`
      : "";
  const cropWindow = `crop=${width}:${contentH}:(iw-${width})*${panX}:(ih-${contentH})*${panY},setsar=1`;
  const padTop =
    topPad > 0 ? `,pad=${width}:${height}:0:${topPad}:black` : "";

  const framed = `[0:v]fps=${fps},${coverScale}${zoomScale},${cropWindow}${padTop}`;

  const videoFilter =
    aspectMode === "crop-fill"
      ? [
          `${framed}[base]`,
          ranksOverlay
            ? `[base][2:v]overlay=0:0:shortest=1[withranks];[withranks][1:v]overlay=0:0:shortest=1[vout]`
            : `[base][1:v]overlay=0:0:shortest=1[vout]`,
        ].join(";")
      : [
          // Blur bg still fills full frame; FG uses same crop framing
          `[0:v]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=${blur},setsar=1[bg]`,
          `${framed}[fg]`,
          topPad > 0
            ? `[bg][fg]overlay=0:${topPad}[comp]`
            : `[bg][fg]overlay=(W-w)/2:(H-h)/2[comp]`,
          ranksOverlay
            ? `[comp][2:v]overlay=0:0:shortest=1[withranks];[withranks][1:v]overlay=0:0:shortest=1[vout]`
            : `[comp][1:v]overlay=0:0:shortest=1[vout]`,
        ].join(";");

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
    String(duration),
    "-i",
    titleOverlay,
  ];

  if (ranksOverlay) {
    commonArgs.push("-loop", "1", "-t", String(duration), "-i", ranksOverlay);
  }

  const encodeArgs = [
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-r",
    String(fps),
    output,
  ];

  try {
    await runCommand("ffmpeg", [
      ...commonArgs,
      "-filter_complex",
      `${videoFilter};[0:a]volume=${clipVolume},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`,
      ...encodeArgs,
    ]);
  } catch {
    const silenceIdx = ranksOverlay ? 3 : 2;
    await runCommand("ffmpeg", [
      ...commonArgs,
      "-f",
      "lavfi",
      "-t",
      String(duration),
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-filter_complex",
      `${videoFilter};[${silenceIdx}:a]volume=${clipVolume}[aout]`,
      ...encodeArgs,
    ]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const tools = whichTools();
    if (!tools.ffmpeg?.ok || !tools.python3?.ok) {
      return NextResponse.json(
        {
          error:
            "Export needs ffmpeg and python3 (Pillow). Windows: winget install Gyan.FFmpeg Python.Python.3.12 && pip install pillow",
          tools,
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

    const segmentPaths: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      const clip = ordered[i];
      const ranges =
        clip.segments && clip.segments.length > 0
          ? clip.segments
          : [{ start: clip.trimStart, end: clip.trimEnd }];
      const duration = Math.max(
        0.2,
        ranges.reduce((sum, s) => sum + Math.max(0.2, s.end - s.start), 0)
      );
      const source = resolveMedia(clip.mediaId);
      let input = source;
      let trimStart = ranges[0].start;

      if (ranges.length > 1) {
        const merged = path.join(jobDir, `merged-src-${i}.mp4`);
        await buildMergedSource(source, ranges, merged, fps);
        input = merged;
        trimStart = 0;
      } else {
        // single range — still use seek in renderClipSegment
        trimStart = ranges[0].start;
      }

      const renderDuration =
        ranges.length > 1
          ? duration
          : Math.max(0.2, ranges[0].end - ranges[0].start);

      // Per-clip ranks overlay with this clip's label emphasized
      const ranksOverlay = body.showRankList ? path.join(jobDir, `ranks-${i}.png`) : null;
      const perCfg = {
        ...titleCfg,
        activeRank: clip.rank,
        ranks: ordered.map((c) => ({
          rank: c.rank,
          label: c.rank === clip.rank ? c.label : "",
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
      const barH =
        typeof body.title?.barHeight === "number"
          ? body.title.barHeight
          : body.title?.showBar === false
            ? 0
            : 150;
      await renderClipSegment({
        input,
        output: seg,
        trimStart: ranges.length > 1 ? 0 : trimStart,
        duration: renderDuration,
        width,
        height,
        blurAmount: body.blurAmount ?? 28,
        aspectMode: body.aspectMode || "crop-fill",
        titleOverlay,
        ranksOverlay: body.showRankList ? ranksOverlay : null,
        fps,
        clipVolume: body.clipVolume ?? 1,
        crop: clip.crop || { zoom: 1, panX: 50, panY: 50 },
        titleOverlap: body.titleOverlap !== false,
        titleBarHeight: barH,
      });

      // Optional flash/zoom transition frames baked as a short cut — flash via fade
      if (body.transition === "flash" && i < ordered.length - 1) {
        const flashed = path.join(jobDir, `seg-${i}-flash.mp4`);
        const td = Math.min(0.35, body.transitionDuration || 0.25);
        await runCommand("ffmpeg", [
          "-y",
          "-i",
          seg,
          "-vf",
          `fade=t=out:st=${Math.max(0, renderDuration - td)}:d=${td}:color=white`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "copy",
          flashed,
        ]);
        segmentPaths.push(flashed);
      } else if (body.transition === "zoom" && i < ordered.length - 1) {
        const zoomed = path.join(jobDir, `seg-${i}-zoom.mp4`);
        const td = Math.min(0.4, body.transitionDuration || 0.25);
        await runCommand("ffmpeg", [
          "-y",
          "-i",
          seg,
          "-vf",
          `zoompan=z='if(gte(time,${Math.max(0, renderDuration - td)}),1+0.35*(time-(${Math.max(0, renderDuration - td)}))/${td},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "copy",
          zoomed,
        ]);
        segmentPaths.push(zoomed);
      } else {
        segmentPaths.push(seg);
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
    if (body.musicMediaId) {
      const music = resolveMedia(body.musicMediaId);
      const vol = body.musicVolume ?? 0.35;
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        concatOut,
        "-stream_loop",
        "-1",
        "-i",
        music,
        "-filter_complex",
        `[0:a]volume=1[a0];[1:a]volume=${vol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "-movflags",
        "+faststart",
        finalOut,
      ]);
    } else {
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        concatOut,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        finalOut,
      ]);
    }

    return NextResponse.json({
      exportId: `${jobId}.mp4`,
      downloadUrl: `/api/media/${jobId}.mp4`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    console.error("export error", message);
    return NextResponse.json({ error: message.slice(0, 600) }, { status: 500 });
  }
}
