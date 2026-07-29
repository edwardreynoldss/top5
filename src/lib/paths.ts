import { mkdirSync } from "fs";
import path from "path";

export const DATA_ROOT = path.join(process.cwd(), "tmp");
export const UPLOAD_DIR = path.join(DATA_ROOT, "uploads");
export const EXPORT_DIR = path.join(DATA_ROOT, "exports");

export function ensureDirs() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  mkdirSync(EXPORT_DIR, { recursive: true });
}

export function mediaPath(id: string, ext = "mp4") {
  return path.join(UPLOAD_DIR, `${id}.${ext}`);
}

export function exportPath(id: string) {
  return path.join(EXPORT_DIR, `${id}.mp4`);
}
