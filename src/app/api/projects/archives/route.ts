import { NextRequest, NextResponse } from "next/server";
import {
  listProjectArchives,
  projectWorthArchiving,
  saveProjectArchive,
  type ArchiveReason,
} from "@/lib/projectArchives";
import type { EditorProject } from "@/lib/types";

export const runtime = "nodejs";

/** List saved films (newest first). Prunes entries older than ~2 months. */
export async function GET() {
  try {
    const items = listProjectArchives();
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list archives";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Save a project snapshot (before reset / after export / manual). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      project?: EditorProject;
      reason?: ArchiveReason;
      channelSlug?: string;
      channelName?: string;
      number?: number | null;
      version?: number | null;
      label?: string;
      force?: boolean;
    };

    if (!body.project || typeof body.project !== "object") {
      return NextResponse.json({ error: "project required" }, { status: 400 });
    }

    const reason = body.reason || "manual";
    if (!body.force && !projectWorthArchiving(body.project) && reason !== "manual") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "empty project",
      });
    }

    const meta = saveProjectArchive({
      project: body.project,
      reason,
      channelSlug: body.channelSlug,
      channelName: body.channelName,
      number: body.number,
      version: body.version,
      label: body.label,
    });

    return NextResponse.json({ ok: true, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
