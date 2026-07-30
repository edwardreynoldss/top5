import { NextResponse } from "next/server";
import { whichTools } from "@/lib/bins";

export const runtime = "nodejs";

export async function GET() {
  const tools = whichTools();
  // Core export/download tools. Pillow is auto-installed on export if missing.
  const coreOk = Boolean(
    tools.ffmpeg?.ok && tools.ffprobe?.ok && tools.python3?.ok
  );
  return NextResponse.json({
    ok: coreOk,
    tools,
    pillowReady: Boolean(tools.pillow?.ok),
    hint: !tools.pillow?.ok
      ? 'Pillow missing — export will auto-install, or run: python -m pip install pillow'
      : undefined,
  });
}
