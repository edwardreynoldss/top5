import { NextRequest, NextResponse } from "next/server";
import { saveOverlayUpload } from "@/lib/overlayFolder";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;

/** Upload a custom overlay object (PNG/GIF/WebP/WebM…) into overlays/. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 40MB)" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const item = saveOverlayUpload(file.name || "overlay.png", buf);
    return NextResponse.json({
      ...item,
      count: 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message.slice(0, 400) }, { status: 400 });
  }
}
