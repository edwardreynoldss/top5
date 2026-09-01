import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { resolveSfxDropFile, renameSfxDropFile, deleteSfxDropFile } from "@/lib/sfxFolder";

export const runtime = "nodejs";

function contentTypeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".mp4")) {
    return "audio/mp4";
  }
  return "application/octet-stream";
}

async function serve(name: string, req: NextRequest) {
  const decoded = decodeURIComponent(name);
  const filePath = resolveSfxDropFile(decoded);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const range = req.headers.get("range");
  const type = contentTypeFor(decoded);

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
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      end >= stat.size ||
      start > end
    ) {
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
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  let requested = "";
  try {
    const body = (await req.json()) as { fileName?: string; name?: string };
    requested = String(body.fileName || body.name || "");
  } catch {
    requested = "";
  }
  try {
    const result = renameSfxDropFile(decoded, requested);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not rename sound";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  try {
    const result = deleteSfxDropFile(decoded);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete sound";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  return serve(name, req);
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  const filePath = resolveSfxDropFile(decoded);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stat = statSync(filePath);
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(decoded),
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
