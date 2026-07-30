import { mkdirSync, readdirSync, copyFileSync, existsSync } from "fs";
import path from "path";

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

/** Next free N for exports/ranking-short-N.mp4 */
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

/** Copy finished render into exports/ranking-short-N.mp4 */
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
