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
}

interface ExportBody {
  clips: ExportClip[];
  title: Record<string, unknown>;
  ranksLayout?: Record<string, unknown>;
  playOrder: PlayOrder;
  transition: TransitionType;
  transitionDuration: number;
  aspectMode: AspectMode;
  blurAmount: number;
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
  } = opts;

  const blur = Math.max(2, Math.min(64, Math.round(blurAmount / 2)));

  // Input is already seeked via -ss, so filters start at 0
  const videoFilter =
    aspectMode === "crop-fill"
      ? [
          `[0:v]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[base]`,
          ranksOverlay
            ? `[base][2:v]overlay=0:0:shortest=1[withranks];[withranks][1:v]overlay=0:0:shortest=1[vout]`
            : `[base][1:v]overlay=0:0:shortest=1[vout]`,
        ].join(";")
      : [
          `[0:v]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=${blur},setsar=1[bg]`,
          `[0:v]fps=${fps},scale=${width}:-2:force_original_aspect_ratio=decrease,setsar=1[fg]`,
          `[bg][fg]overlay=(W-w)/2:(H-h)/2[comp]`,
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
    // No usable audio track — synthesize silence
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
            "Export needs ffmpeg and python3 (Pillow). macOS: brew install ffmpeg && pip3 install pillow",
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
      const duration = Math.max(0.2, clip.trimEnd - clip.trimStart);
      const input = resolveMedia(clip.mediaId);

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
      await renderClipSegment({
        input,
        output: seg,
        trimStart: clip.trimStart,
        duration,
        width,
        height,
        blurAmount: body.blurAmount ?? 28,
        aspectMode: body.aspectMode || "blur-pad",
        titleOverlay,
        ranksOverlay: body.showRankList ? ranksOverlay : null,
        fps,
        clipVolume: body.clipVolume ?? 1,
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
          `fade=t=out:st=${Math.max(0, duration - td)}:d=${td}:color=white`,
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
          `zoompan=z='if(gte(time,${Math.max(0, duration - td)}),1+0.35*(time-(${Math.max(0, duration - td)}))/${td},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
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
