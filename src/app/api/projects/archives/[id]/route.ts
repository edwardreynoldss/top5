import { NextRequest, NextResponse } from "next/server";
import { deleteProjectArchive, readProjectArchive } from "@/lib/projectArchives";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Load one archived film (meta + full project). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const archive = readProjectArchive(decodeURIComponent(id));
    if (!archive) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }
    return NextResponse.json(archive);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete one archived film. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ok = deleteProjectArchive(decodeURIComponent(id));
    if (!ok) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
