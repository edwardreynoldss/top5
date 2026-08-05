import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
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
  const items = Array.from(byName.values()).sort((a, b) =>
    a.fileName.localeCompare(b.fileName)
  );
  return { items, folder: OVERLAY_DIR };
}
