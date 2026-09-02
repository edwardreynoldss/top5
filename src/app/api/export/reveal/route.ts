import { NextRequest, NextResponse } from "next/server";
import { ensureDirs, safeExportRevealPath } from "@/lib/paths";
import { revealPathInFileManager } from "@/lib/reveal-in-file-manager";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body.path === "string" ? body.path : "";
    const resolved = safeExportRevealPath(raw);
    if (!resolved) {
      return NextResponse.json(
        { error: "That path is not inside the exports folder." },
        { status: 400 }
      );
    }

    ensureDirs();
    await revealPathInFileManager(resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
