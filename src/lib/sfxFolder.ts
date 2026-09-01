import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { probeDuration } from "@/lib/ffmpeg";
import { DATA_ROOT, ensureDirs } from "@/lib/paths";

export const SFX_DIR = path.join(process.cwd(), "sfx");
export const SFX_MANIFEST_PATH = path.join(DATA_ROOT, "sfx-manifest.json");

const AUDIO_EXT = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".webm",
  ".mp4",
]);

export type SfxFolderItem = {
  /** Stable id used as mediaId: drop__filename.ext */
  id: string;
  fileName: string;
  mediaId: string;
  mediaUrl: string;
  duration: number;
  bytes: number;
  mtimeMs: number;
};

type ManifestFile = {
  fileName: string;
  bytes: number;
  mtimeMs: number;
  duration: number;
  /** True only after a successful ffprobe (> 0). Legacy fakes (0.5) lack this. */
  probedOk?: boolean;
};

type Manifest = {
  updatedAt: number;
  files: Record<string, ManifestFile>;
};

function ensureSfxDir() {
  mkdirSync(SFX_DIR, { recursive: true });
}

export function sfxMediaId(fileName: string) {
  return `drop__${fileName}`;
}

export function isDropSfxMediaId(mediaId: string) {
  return mediaId.startsWith("drop__");
}

export function dropSfxFileName(mediaId: string) {
  if (!isDropSfxMediaId(mediaId)) return null;
  return mediaId.slice("drop__".length);
}

export function resolveSfxDropFile(mediaIdOrName: string): string | null {
  ensureSfxDir();
  const raw = isDropSfxMediaId(mediaIdOrName)
    ? dropSfxFileName(mediaIdOrName)
    : mediaIdOrName;
  if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    return null;
  }
  const full = path.join(SFX_DIR, raw);
  if (!existsSync(full)) return null;
  // Stay inside sfx/
  if (path.dirname(full) !== SFX_DIR) return null;
  return full;
}

function loadManifest(): Manifest {
  try {
    if (!existsSync(SFX_MANIFEST_PATH)) return { updatedAt: 0, files: {} };
    const parsed = JSON.parse(readFileSync(SFX_MANIFEST_PATH, "utf8")) as Manifest;
    return {
      updatedAt: parsed.updatedAt || 0,
      files: parsed.files || {},
    };
  } catch {
    return { updatedAt: 0, files: {} };
  }
}

function saveManifest(manifest: Manifest) {
  ensureDirs();
  writeFileSync(
    SFX_MANIFEST_PATH,
    JSON.stringify({ ...manifest, updatedAt: Date.now() }, null, 2)
  );
}

function listAudioFiles(): { fileName: string; bytes: number; mtimeMs: number }[] {
  ensureSfxDir();
  const names = readdirSync(SFX_DIR);
  const out: { fileName: string; bytes: number; mtimeMs: number }[] = [];
  for (const fileName of names) {
    if (fileName.startsWith(".")) continue;
    const ext = path.extname(fileName).toLowerCase();
    if (!AUDIO_EXT.has(ext)) continue;
    const full = path.join(SFX_DIR, fileName);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      out.push({ fileName, bytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
      // skip unreadable
    }
  }
  out.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return out;
}

/** Cached duration is trusted only after a real probe. Legacy 0.5 fakes are discarded. */
function cachedDurationOk(prev: ManifestFile | undefined, f: { bytes: number; mtimeMs: number }) {
  if (!prev) return false;
  if (prev.bytes !== f.bytes || prev.mtimeMs !== f.mtimeMs) return false;
  if (!(prev.duration > 0)) return false;
  // Old bug wrote 0.5 on probe failure — re-probe those entries
  if (!prev.probedOk) return false;
  return true;
}

/**
 * Fast folder inventory: readdir + cached durations only.
 * Probes new/changed/untrusted files within a time budget so durations fill in.
 */
export async function getSfxFolderLibrary(opts?: {
  probeBudgetMs?: number;
}): Promise<{ items: SfxFolderItem[]; probed: number; folder: string }> {
  const probeBudgetMs = opts?.probeBudgetMs ?? 8000;
  const disk = listAudioFiles();
  const manifest = loadManifest();
  const nextFiles: Record<string, ManifestFile> = {};
  const toProbe: string[] = [];

  for (const f of disk) {
    const prev = manifest.files[f.fileName];
    if (cachedDurationOk(prev, f)) {
      nextFiles[f.fileName] = { ...prev!, probedOk: true };
    } else {
      nextFiles[f.fileName] = {
        fileName: f.fileName,
        bytes: f.bytes,
        mtimeMs: f.mtimeMs,
        duration: 0,
        probedOk: false,
      };
      toProbe.push(f.fileName);
    }
  }

  let probed = 0;
  const started = Date.now();
  for (const fileName of toProbe) {
    if (Date.now() - started > probeBudgetMs) break;
    const full = path.join(SFX_DIR, fileName);
    try {
      const duration = await probeDuration(full);
      if (duration > 0) {
        nextFiles[fileName] = {
          ...nextFiles[fileName],
          duration,
          probedOk: true,
        };
      }
      // Leave duration 0 on failure so the next refresh retries — never fake 0.5
      probed += 1;
    } catch {
      probed += 1;
    }
  }

  saveManifest({ updatedAt: Date.now(), files: nextFiles });

  const items: SfxFolderItem[] = disk.map((f) => {
    const mediaId = sfxMediaId(f.fileName);
    const duration = nextFiles[f.fileName]?.duration || 0;
    return {
      id: mediaId,
      fileName: f.fileName,
      mediaId,
      mediaUrl: `/api/sfx/file/${encodeURIComponent(f.fileName)}`,
      duration,
      bytes: f.bytes,
      mtimeMs: f.mtimeMs,
    };
  });

  return { items, probed, folder: SFX_DIR };
}

function splitSfxNameExt(fileName: string) {
  const base = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0) return { stem: base, ext: "" };
  return { stem: base.slice(0, i), ext: base.slice(i) };
}

/** Keep the original extension; strip path junk and illegal filename chars. */
export function sanitizeSfxFileName(currentFileName: string, requested: string) {
  const { ext } = splitSfxNameExt(currentFileName);
  let raw = String(requested || "").trim();
  raw = raw.replace(/\\/g, "/").split("/").pop() || "";
  raw = raw.replace(/[<>:"|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (!raw) throw new Error("Name cannot be empty");
  const req = splitSfxNameExt(raw);
  let stem = req.stem.trim();
  if (!stem) throw new Error("Name cannot be empty");
  if (stem === "." || stem === "..") throw new Error("Invalid name");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `${stem}-sfx`;
  return `${stem}${ext || req.ext || ""}`;
}

export function uniqueSfxFileName(
  desired: string,
  taken: Iterable<string>,
  keep?: string
) {
  const used = new Set(taken);
  if (keep) used.delete(keep);
  if (!used.has(desired)) return desired;
  const { stem, ext } = splitSfxNameExt(desired);
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}-${n}${ext}`;
  }
  return next;
}

export function renameSfxDropFile(fromName: string, requestedName: string) {
  ensureSfxDir();
  const current = isDropSfxMediaId(fromName)
    ? dropSfxFileName(fromName) || fromName
    : path.basename(fromName);
  const src = resolveSfxDropFile(current);
  if (!src) throw new Error("Sound not found in the sfx folder");
  const existing = listAudioFiles().map((f) => f.fileName);
  const wanted = sanitizeSfxFileName(current, requestedName);
  const destName = uniqueSfxFileName(wanted, existing, current);
  if (destName === current) {
    return {
      fileName: current,
      mediaId: sfxMediaId(current),
      mediaUrl: `/api/sfx/file/${encodeURIComponent(current)}`,
      renamed: false,
    };
  }
  const dest = path.join(SFX_DIR, destName);
  if (path.dirname(dest) !== SFX_DIR) throw new Error("Invalid name");
  renameSync(src, dest);
  const manifest = loadManifest();
  const prev = manifest.files[current];
  if (prev) {
    delete manifest.files[current];
    manifest.files[destName] = { ...prev, fileName: destName };
    saveManifest(manifest);
  }
  return {
    fileName: destName,
    mediaId: sfxMediaId(destName),
    mediaUrl: `/api/sfx/file/${encodeURIComponent(destName)}`,
    renamed: true,
  };
}

export function deleteSfxDropFile(fileName: string) {
  const full = resolveSfxDropFile(fileName);
  if (!full) throw new Error("Sound not found in the sfx folder");
  const name = path.basename(full);
  unlinkSync(full);
  const manifest = loadManifest();
  if (manifest.files[name] || manifest.files[fileName]) {
    delete manifest.files[name];
    delete manifest.files[fileName];
    saveManifest(manifest);
  }
  return { ok: true as const, fileName: name };
}
