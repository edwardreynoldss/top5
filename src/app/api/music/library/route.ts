import { NextResponse } from "next/server";
import { getMusicFolderLibrary } from "@/lib/musicFolder";

export const runtime = "nodejs";

/** Lightweight list of files in /music — durations from a cached manifest. */
export async function GET() {
  try {
    const { items, probed, folder } = await getMusicFolderLibrary({ probeBudgetMs: 200 });
    return NextResponse.json({
      items,
      probed,
      folder,
      count: items.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list music folder";
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
