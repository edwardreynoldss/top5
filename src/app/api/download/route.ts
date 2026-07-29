import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync, readdirSync, renameSync } from "fs";
import path from "path";
import { ensureDirs, mediaPath, UPLOAD_DIR } from "@/lib/paths";
import { probeDuration, runCommand } from "@/lib/ffmpeg";
import { whichTools } from "@/lib/bins";

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
    const tools = whichTools();
    if (!tools["yt-dlp"]?.ok) {
      return NextResponse.json(
        {
          error:
            "yt-dlp is not installed. Install it (macOS: brew install yt-dlp) or upload the video file instead.",
          tools,
        },
        { status: 500 }
      );
    }
    if (!tools.ffmpeg?.ok) {
      return NextResponse.json(
        {
          error:
            "ffmpeg is not installed. Install it (macOS: brew install ffmpeg) then retry, or upload after converting to mp4.",
          tools,
        },
        { status: 500 }
      );
    }

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
      "music.youtube.com",
      "tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
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

    const commonArgs = [
      "--no-playlist",
      "--max-filesize",
      "250M",
      "-o",
      outTemplate,
      "--no-warnings",
      "--newline",
      "--retries",
      "3",
    ];

    let lastError = "";
    const browser = process.env.YT_DLP_COOKIES_FROM_BROWSER || "chrome";
    const attempts: string[][] = [
      [
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        ...commonArgs,
        url,
      ],
      [
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        "--cookies-from-browser",
        browser,
        ...commonArgs,
        url,
      ],
      ["-f", "best", "--merge-output-format", "mp4", ...commonArgs, url],
      [
        "-f",
        "best",
        "--merge-output-format",
        "mp4",
        "--cookies-from-browser",
        browser,
        ...commonArgs,
        url,
      ],
      [...commonArgs, url],
    ];

    let downloaded: string | null = null;
    for (const args of attempts) {
      try {
        await runCommand("yt-dlp", args);
        downloaded = findDownloadedFile(UPLOAD_DIR, id);
        if (downloaded) break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!downloaded) {
      const botBlocked = /sign in|not a bot|cookies/i.test(lastError);
      const tip = botBlocked
        ? ` YouTube/TikTok may require browser cookies. Set YT_DLP_COOKIES_FROM_BROWSER=chrome (or safari/firefox) and restart, or upload the MP4 instead.`
        : host.includes("tiktok") || host.includes("instagram")
          ? " TikTok/Instagram often block anonymous downloads — upload the MP4 instead."
          : " Try `brew upgrade yt-dlp`, set YT_DLP_COOKIES_FROM_BROWSER=chrome, or upload the file.";
      return NextResponse.json(
        {
          error: `Could not download that link.${tip}`,
          detail: lastError.slice(0, 800),
        },
        { status: 502 }
      );
    }

    const ext = path.extname(downloaded).replace(".", "") || "mp4";
    const finalPath = mediaPath(id, ext);
    if (downloaded !== finalPath) {
      renameSync(downloaded, finalPath);
    }

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
        error: message.includes("ENOENT") || message.includes("Could not find")
          ? message
          : `Download failed: ${message.slice(0, 400)}`,
        detail: message.slice(0, 800),
      },
      { status: 502 }
    );
  }
}
