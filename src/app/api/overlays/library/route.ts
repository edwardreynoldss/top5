import { NextResponse } from "next/server";
import { getOverlayFolderLibrary } from "@/lib/overlayFolder";

export const runtime = "nodejs";

/** List bundled + drop-folder overlay objects (arrows, circles, GIFs…). */
export async function GET() {
  try {
    const { items, folder } = getOverlayFolderLibrary();
    return NextResponse.json({
      items,
      folder,
      count: items.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list overlays";
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
