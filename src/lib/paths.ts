import { mkdirSync, readdirSync, copyFileSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { channelSlug, channelExportFileName } from "./channels";

export const DATA_ROOT = path.join(process.cwd(), "tmp");
export const UPLOAD_DIR = path.join(DATA_ROOT, "uploads");
/** Scratch/job working dir for in-progress renders */
export const EXPORT_DIR = path.join(DATA_ROOT, "exports");
/** Finished numbered MP4s live in the project folder */
export const PROJECT_EXPORTS_DIR = path.join(process.cwd(), "exports");

export const EXPORT_FILE_PREFIX = "ranking-short";

export function ensureDirs() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  mkdirSync(EXPORT_DIR, { recursive: true });
  mkdirSync(PROJECT_EXPORTS_DIR, { recursive: true });
}

export function mediaPath(id: string, ext = "mp4") {
  return path.join(UPLOAD_DIR, `${id}.${ext}`);
}

export function exportPath(id: string) {
  return path.join(EXPORT_DIR, `${id}.mp4`);
}

/** Ensure exports/{slug}/ exists (and a .gitkeep for empty dirs). */
export function ensureChannelExportDir(slug: string) {
  ensureDirs();
  const safe = channelSlug(slug);
  const dir = path.join(PROJECT_EXPORTS_DIR, safe);
  mkdirSync(dir, { recursive: true });
  const keep = path.join(dir, ".gitkeep");
  if (!existsSync(keep)) {
    try {
      writeFileSync(keep, "");
    } catch {
      // ignore
    }
  }
  return dir;
}

/** @deprecated Prefer planChannelExport + publishChannelExport — kept for old tests */
export function nextExportNumber(): number {
  ensureDirs();
  let max = 0;
  for (const name of readdirSync(PROJECT_EXPORTS_DIR)) {
    const m = new RegExp(`^${EXPORT_FILE_PREFIX}-(\\d+)\\.mp4$`, "i").exec(name);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function projectExportFileName(n: number) {
  return `${EXPORT_FILE_PREFIX}-${n}.mp4`;
}

export function projectExportPath(n: number) {
  return path.join(PROJECT_EXPORTS_DIR, projectExportFileName(n));
}

/** Copy finished render into exports/ranking-short-N.mp4 (legacy flat layout) */
export function publishProjectExport(sourceMp4: string): {
  number: number;
  fileName: string;
  absolutePath: string;
  relativePath: string;
} {
  if (!existsSync(sourceMp4)) {
    throw new Error(`Export source missing: ${sourceMp4}`);
  }
  const number = nextExportNumber();
  const fileName = projectExportFileName(number);
  const absolutePath = projectExportPath(number);
  copyFileSync(sourceMp4, absolutePath);
  return {
    number,
    fileName,
    absolutePath,
    relativePath: path.join("exports", fileName),
  };
}

/** Copy finished render into exports/{channel}/ranking-{channel}-{n}[.v].mp4 */
export function publishChannelExport(
  sourceMp4: string,
  opts: { channelSlug: string; number: number; version: number }
): {
  number: number;
  version: number;
  channelSlug: string;
  fileName: string;
  absolutePath: string;
  relativePath: string;
  downloadId: string;
} {
  if (!existsSync(sourceMp4)) {
    throw new Error(`Export source missing: ${sourceMp4}`);
  }
  const slug = channelSlug(opts.channelSlug);
  const dir = ensureChannelExportDir(slug);
  const fileName = channelExportFileName(slug, opts.number, opts.version);
  const absolutePath = path.join(dir, fileName);
  copyFileSync(sourceMp4, absolutePath);
  const downloadId = `${slug}/${fileName}`;
  return {
    number: opts.number,
    version: opts.version,
    channelSlug: slug,
    fileName,
    absolutePath,
    relativePath: path.join("exports", slug, fileName),
    downloadId,
  };
}
