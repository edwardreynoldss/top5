import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import { ensureDirs, mediaPath } from "@/lib/paths";
import { probeDuration, runCommand } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    ensureDirs();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > 250 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 250MB)" }, { status: 400 });
    }

    const id = randomUUID();
    const originalName = file.name || "upload.mp4";
    const buf = Buffer.from(await file.arrayBuffer());
    const rawExt = (originalName.split(".").pop() || "mp4").toLowerCase();
    const safeExt = ["mp4", "mov", "webm", "mkv", "m4v"].includes(rawExt) ? rawExt : "mp4";
    const rawPath = mediaPath(id, `raw.${safeExt}`);
    await writeFile(rawPath, buf);

    const outPath = mediaPath(id, "mp4");
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      rawPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outPath,
    ]);

    const duration = await probeDuration(outPath);
    const mediaId = `${id}.mp4`;

    return NextResponse.json({
      mediaId,
      mediaUrl: `/api/media/${mediaId}`,
      duration,
      fileName: originalName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("upload error", message);
    return NextResponse.json({ error: message.slice(0, 400) }, { status: 500 });
  }
}
