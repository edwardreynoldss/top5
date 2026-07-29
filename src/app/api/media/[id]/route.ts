import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { UPLOAD_DIR, EXPORT_DIR } from "@/lib/paths";

export const runtime = "nodejs";

function resolveFile(id: string) {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return null;
  }
  const candidates = [path.join(UPLOAD_DIR, id), path.join(EXPORT_DIR, id)];
  const filePath = candidates.find((p) => existsSync(p));
  return filePath || null;
}

function contentTypeFor(id: string) {
  const lower = id.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "audio/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function baseHeaders(id: string, size: number): HeadersInit {
  return {
    "Content-Type": contentTypeFor(id),
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
    "Cache-Control": "private, max-age=3600",
  };
}

export async function HEAD(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const filePath = resolveFile(id);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stat = statSync(filePath);
  return new NextResponse(null, {
    status: 200,
    headers: baseHeaders(id, stat.size),
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const filePath = resolveFile(id);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) {
      return new NextResponse("Invalid Range", {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= stat.size || start > end) {
      return new NextResponse("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentTypeFor(id),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: baseHeaders(id, stat.size),
  });
}
