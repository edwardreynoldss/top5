import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync, readdirSync, renameSync } from "fs";
import path from "path";
import { ensureDirs, mediaPath, UPLOAD_DIR } from "@/lib/paths";
import { probeDuration, runCommand } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

function findDownloadedFile(dir: string, id: string) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  const match = files.find((f) => f.startsWith(id));
  return match ? path.join(dir, match) : null;
}

export async function POST(req: NextRequest) {
  try {
    ensureDirs();
    const body = await req.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const host = parsed.hostname.replace(/^www\./, "");
    const allowed = [
      "youtube.com",
      "youtu.be",
      "m.youtube.com",
      "tiktok.com",
      "vm.tiktok.com",
      "instagram.com",
      "instagr.am",
    ];
    if (!allowed.some((d) => host === d || host.endsWith(`.${d}`))) {
      return NextResponse.json(
        {
          error:
            "Only YouTube, TikTok, and Instagram links are supported. You can also upload a video file directly.",
        },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const outTemplate = path.join(UPLOAD_DIR, `${id}.%(ext)s`);

    await runCommand("yt-dlp", [
      "-f",
      "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--max-filesize",
      "200M",
      "-o",
      outTemplate,
      "--no-warnings",
      url,
    ]);

    const downloaded = findDownloadedFile(UPLOAD_DIR, id);
    if (!downloaded) {
      return NextResponse.json({ error: "Download completed but file not found" }, { status: 500 });
    }

    const ext = path.extname(downloaded).replace(".", "") || "mp4";
    const finalPath = mediaPath(id, ext);
    if (downloaded !== finalPath) {
      renameSync(downloaded, finalPath);
    }

    // Normalize to mp4 if needed
    let mediaExt = ext;
    if (ext !== "mp4") {
      const mp4Path = mediaPath(id, "mp4");
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        finalPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        mp4Path,
      ]);
      mediaExt = "mp4";
    }

    const filePath = mediaPath(id, mediaExt);
    const duration = await probeDuration(filePath);

    return NextResponse.json({
      mediaId: `${id}.${mediaExt}`,
      mediaUrl: `/api/media/${id}.${mediaExt}`,
      duration,
      fileName: `${host}-clip.${mediaExt}`,
      sourceUrl: url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("download error", message);
    return NextResponse.json(
      {
        error:
          "Could not download that link. Some TikTok/Instagram videos need login cookies. Try uploading the video file instead.",
        detail: message.slice(0, 400),
      },
      { status: 502 }
    );
  }
}
