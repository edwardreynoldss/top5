import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import {
  isOverlayMediaId,
  overlayFileName,
  overlayMediaUrl,
} from "./overlayMedia";

export {
  isBundledOverlayMediaId,
  isOverlayMediaId,
  overlayFileName,
  overlayMediaUrl,
} from "./overlayMedia";

export const OVERLAY_DIR = path.join(process.cwd(), "overlays");
export const PUBLIC_OVERLAY_DIR = path.join(process.cwd(), "public", "overlays");

const MEDIA_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".webm",
  ".mov",
  ".mp4",
]);

export type OverlayFolderItem = {
  id: string;
  fileName: string;
  mediaId: string;
  mediaUrl: string;
  bytes: number;
  mtimeMs: number;
  bundled: boolean;
};

function ensureOverlayDir() {
  mkdirSync(OVERLAY_DIR, { recursive: true });
}

export function overlayMediaId(fileName: string, bundled = false) {
  return bundled ? `overlay__${fileName}` : `overlaydrop__${fileName}`;
}

/** Resolve overlay media to an absolute filesystem path. */
export function resolveOverlayFile(mediaIdOrName: string): string | null {
  ensureOverlayDir();
  const raw = isOverlayMediaId(mediaIdOrName)
    ? overlayFileName(mediaIdOrName)
    : mediaIdOrName;
  if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    return null;
  }
  const dropPath = path.join(OVERLAY_DIR, raw);
  const pubPath = path.join(PUBLIC_OVERLAY_DIR, raw);
  const full = existsSync(dropPath) ? dropPath : existsSync(pubPath) ? pubPath : null;
  if (!full) return null;
  const parent = path.dirname(full);
  if (parent !== OVERLAY_DIR && parent !== PUBLIC_OVERLAY_DIR) return null;
  return full;
}

function listDir(dir: string, bundled: boolean): OverlayFolderItem[] {
  if (!existsSync(dir)) return [];
  const items: OverlayFolderItem[] = [];
  for (const name of readdirSync(dir)) {
    const ext = path.extname(name).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const mediaId = overlayMediaId(name, bundled);
    items.push({
      id: mediaId,
      fileName: name,
      mediaId,
      mediaUrl: overlayMediaUrl(mediaId),
      bytes: st.size,
      mtimeMs: st.mtimeMs,
      bundled,
    });
  }
  return items;
}

/** Merge drop-folder overlays with bundled public stickers (arrows, circles, …). */
export function getOverlayFolderLibrary(): {
  items: OverlayFolderItem[];
  folder: string;
} {
  ensureOverlayDir();
  const byName = new Map<string, OverlayFolderItem>();
  for (const it of listDir(PUBLIC_OVERLAY_DIR, true)) byName.set(it.fileName, it);
  for (const it of listDir(OVERLAY_DIR, false)) byName.set(it.fileName, it);
  const items = Array.from(byName.values()).sort((a, b) => {
    // Uploads / drop-folder first, then bundled samples
    if (a.bundled !== b.bundled) return a.bundled ? 1 : -1;
    return b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName);
  });
  return { items, folder: OVERLAY_DIR };
}

const UPLOAD_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".webm",
  ".mov",
  ".mp4",
]);

/** Sanitize an upload basename and pick a free name under overlays/. */
export function uniqueOverlayFileName(originalName: string): string {
  ensureOverlayDir();
  const base = path.basename(originalName || "overlay.png");
  const ext = path.extname(base).toLowerCase();
  if (!UPLOAD_EXT.has(ext)) {
    throw new Error("Use PNG, GIF, WebP, JPG, WebM, MOV, or MP4");
  }
  let stem = path
    .basename(base, path.extname(base))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!stem) stem = "overlay";
  let candidate = `${stem}${ext}`;
  let n = 2;
  while (
    existsSync(path.join(OVERLAY_DIR, candidate)) ||
    existsSync(path.join(PUBLIC_OVERLAY_DIR, candidate))
  ) {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  return candidate;
}

/** Write bytes into overlays/ and return a library item (overlaydrop__). */
export function saveOverlayUpload(
  originalName: string,
  bytes: Buffer
): OverlayFolderItem {
  ensureOverlayDir();
  if (!bytes.length) throw new Error("Empty file");
  const fileName = uniqueOverlayFileName(originalName);
  const full = path.join(OVERLAY_DIR, fileName);
  writeFileSync(full, bytes);
  const st = statSync(full);
  const mediaId = overlayMediaId(fileName, false);
  return {
    id: mediaId,
    fileName,
    mediaId,
    mediaUrl: overlayMediaUrl(mediaId),
    bytes: st.size,
    mtimeMs: st.mtimeMs,
    bundled: false,
  };
}
