import { NextResponse } from "next/server";
import { getSfxFolderLibrary } from "@/lib/sfxFolder";

export const runtime = "nodejs";

/** Lightweight list of files in /sfx — durations come from a cached manifest. */
export async function GET() {
  try {
    // Probe thoroughly — fake 0.5s durations used to cut SFX short
    const { items, probed, folder } = await getSfxFolderLibrary({ probeBudgetMs: 12000 });
    return NextResponse.json({
      items,
      probed,
      folder,
      count: items.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sfx folder";
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
