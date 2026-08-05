import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
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
