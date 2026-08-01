import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { copyFile, writeFile } from "fs/promises";
import { ensureDirs, mediaPath } from "@/lib/paths";
import { probeDuration, probeHasAlpha, runCommand } from "@/lib/ffmpeg";
import { whichTools } from "@/lib/bins";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const tools = whichTools();
    if (!tools.ffmpeg?.ok) {
      return NextResponse.json(
        {
          error:
            "ffmpeg was not found (spawn ENOENT). On Windows run: winget install Gyan.FFmpeg — then close the terminal, reopen it, and restart the app. Or set FFMPEG_PATH to ffmpeg.exe.",
          tools,
        },
        { status: 500 }
      );
    }

    ensureDirs();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > 250 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 250MB)" }, { status: 400 });
    }

    const purpose = String(form.get("purpose") || "");
    const id = randomUUID();
    const originalName = file.name || "upload.mp4";
    const buf = Buffer.from(await file.arrayBuffer());
    const rawExt = (originalName.split(".").pop() || "mp4").toLowerCase();
    const safeExt = ["mp4", "mov", "webm", "mkv", "m4v", "mp3", "wav", "m4a", "aac"].includes(
      rawExt
    )
      ? rawExt
      : "mp4";
    const rawPath = mediaPath(id, `raw.${safeExt}`);
    await writeFile(rawPath, buf);

    // Transparent sticker / overlay: keep WebM (VP9+alpha) — never flatten to H.264
    if (purpose === "sticker") {
      if (safeExt !== "webm" && safeExt !== "mov") {
        return NextResponse.json(
          {
            error:
              "Bottom sticker needs a transparent WebM (VP9 alpha) or ProRes/PNG MOV. Profounder “webm_transparent” exports work.",
          },
          { status: 400 }
        );
      }
      const outPath = mediaPath(id, safeExt);
      // Remux/copy to normalize container; fall back to raw bytes if copy fails
      try {
        await runCommand("ffmpeg", ["-y", "-i", rawPath, "-c", "copy", outPath]);
      } catch {
        await copyFile(rawPath, outPath);
      }
      const hasAlpha = await probeHasAlpha(outPath);
      const duration = await probeDuration(outPath);
      const mediaId = pathBasename(outPath);
      return NextResponse.json({
        mediaId,
        mediaUrl: `/api/media/${mediaId}`,
        duration,
        fileName: originalName,
        hasAlpha,
        purpose: "sticker",
      });
    }

    const isAudio = ["mp3", "wav", "m4a", "aac"].includes(safeExt);
    const outPath = mediaPath(id, isAudio ? (safeExt === "mp3" ? "mp3" : "m4a") : "mp4");

    if (isAudio) {
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        rawPath,
        "-c:a",
        safeExt === "mp3" ? "libmp3lame" : "aac",
        "-b:a",
        "192k",
        outPath,
      ]);
    } else if (safeExt === "mp4") {
      // Fast path: remux only (no re-encode) — much faster for large uploads
      try {
        await runCommand("ffmpeg", [
          "-y",
          "-i",
          rawPath,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          outPath,
        ]);
      } catch {
        // Fallback if codecs aren't browser-friendly
        await runCommand("ffmpeg", [
          "-y",
          "-i",
          rawPath,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          outPath,
        ]);
      }
    } else {
      // Non-mp4: ultrafast transcode
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        rawPath,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outPath,
      ]);
    }

    const duration = await probeDuration(outPath);
    const mediaId = pathBasename(outPath);

    return NextResponse.json({
      mediaId,
      mediaUrl: `/api/media/${mediaId}`,
      duration,
      fileName: originalName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("upload error", message);
    return NextResponse.json({ error: message.slice(0, 800) }, { status: 500 });
  }
}

function pathBasename(p: string) {
  return p.split(/[/\\]/).pop() || p;
}
