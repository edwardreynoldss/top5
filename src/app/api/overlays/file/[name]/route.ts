import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { OVERLAY_DIR, PUBLIC_OVERLAY_DIR } from "@/lib/overlayFolder";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: raw } = await ctx.params;
  const name = decodeURIComponent(raw || "");
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  const drop = path.join(OVERLAY_DIR, name);
  const pub = path.join(PUBLIC_OVERLAY_DIR, name);
  const full = existsSync(drop) ? drop : existsSync(pub) ? pub : null;
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parent = path.dirname(full);
  if (parent !== OVERLAY_DIR && parent !== PUBLIC_OVERLAY_DIR) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = path.extname(name).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const st = statSync(full);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(st.size),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
