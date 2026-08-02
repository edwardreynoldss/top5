import { NextRequest, NextResponse } from "next/server";
import { ensureChannelExportDir } from "@/lib/paths";
import { channelSlug } from "@/lib/channels";

export const runtime = "nodejs";

/** Ensure exports/{channel}/ exists when a channel is added. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { slug?: string; name?: string };
    const slug = channelSlug(body.slug || body.name || "");
    if (!slug) {
      return NextResponse.json({ error: "channel slug required" }, { status: 400 });
    }
    const absoluteDir = ensureChannelExportDir(slug);
    return NextResponse.json({
      ok: true,
      slug,
      dir: `exports/${slug}`,
      absoluteDir,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create channel folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
