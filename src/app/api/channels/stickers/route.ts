import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "fs";
import path from "path";
import { probeDuration, probeHasAlpha } from "@/lib/ffmpeg";
import { channelSlug, channelStickerMediaId } from "@/lib/channels";

export const runtime = "nodejs";

/**
 * List bundled channel stickers shipped in public/stickers/channels/{slug}.webm
 * so the client can seed per-channel subscribe popups.
 */
export async function GET() {
  const dir = path.join(process.cwd(), "public", "stickers", "channels");
  const stickers: Record<
    string,
    {
      mediaId: string;
      mediaUrl: string;
      fileName: string;
      duration: number;
      hasAlpha: boolean;
    }
  > = {};

  if (!existsSync(dir)) {
    return NextResponse.json({ stickers });
  }

  for (const name of readdirSync(dir)) {
    if (!/\.webm$/i.test(name)) continue;
    const slug = channelSlug(name.replace(/\.webm$/i, ""));
    if (!slug) continue;
    const filePath = path.join(dir, name);
    let duration = 0;
    let hasAlpha = false;
    try {
      duration = await probeDuration(filePath);
      hasAlpha = await probeHasAlpha(filePath);
    } catch {
      // still expose the file; client can use duration 0
    }
    stickers[slug] = {
      mediaId: channelStickerMediaId(slug),
      mediaUrl: `/stickers/channels/${slug}.webm`,
      fileName: name,
      duration,
      hasAlpha,
    };
  }

  return NextResponse.json({ stickers });
}
