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

export const MUSIC_DIR = path.join(process.cwd(), "music");
export const MUSIC_MANIFEST_PATH = path.join(DATA_ROOT, "music-manifest.json");

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

export type MusicFolderItem = {
  /** Stable id used as mediaId: music__filename.ext */
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
};

type Manifest = {
  updatedAt: number;
  files: Record<string, ManifestFile>;
};

function ensureMusicDir() {
  mkdirSync(MUSIC_DIR, { recursive: true });
}

export function musicMediaId(fileName: string) {
  return `music__${fileName}`;
}

export function isMusicDropMediaId(mediaId: string) {
  return mediaId.startsWith("music__");
}

export function dropMusicFileName(mediaId: string) {
  if (!isMusicDropMediaId(mediaId)) return null;
  return mediaId.slice("music__".length);
}

export function resolveMusicDropFile(mediaIdOrName: string): string | null {
  ensureMusicDir();
  const raw = isMusicDropMediaId(mediaIdOrName)
    ? dropMusicFileName(mediaIdOrName)
    : mediaIdOrName;
  if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    return null;
  }
  const full = path.join(MUSIC_DIR, raw);
  if (!existsSync(full)) return null;
  if (path.dirname(full) !== MUSIC_DIR) return null;
  return full;
}

function loadManifest(): Manifest {
  try {
    if (!existsSync(MUSIC_MANIFEST_PATH)) return { updatedAt: 0, files: {} };
    const parsed = JSON.parse(readFileSync(MUSIC_MANIFEST_PATH, "utf8")) as Manifest;
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
    MUSIC_MANIFEST_PATH,
    JSON.stringify({ ...manifest, updatedAt: Date.now() }, null, 2)
  );
}

function listAudioFiles(): { fileName: string; bytes: number; mtimeMs: number }[] {
  ensureMusicDir();
  const names = readdirSync(MUSIC_DIR);
  const out: { fileName: string; bytes: number; mtimeMs: number }[] = [];
  for (const fileName of names) {
    if (fileName.startsWith(".")) continue;
    const ext = path.extname(fileName).toLowerCase();
    if (!AUDIO_EXT.has(ext)) continue;
    const full = path.join(MUSIC_DIR, fileName);
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

/**
 * Inventory of music/ drop beds. Durations cached in tmp/music-manifest.json.
 */
export async function getMusicFolderLibrary(opts?: {
  probeBudgetMs?: number;
}): Promise<{ items: MusicFolderItem[]; probed: number; folder: string }> {
  const probeBudgetMs = opts?.probeBudgetMs ?? 200;
  const disk = listAudioFiles();
  const manifest = loadManifest();
  const nextFiles: Record<string, ManifestFile> = {};
  const toProbe: string[] = [];

  for (const f of disk) {
    const prev = manifest.files[f.fileName];
    if (prev && prev.bytes === f.bytes && prev.mtimeMs === f.mtimeMs && prev.duration > 0) {
      nextFiles[f.fileName] = prev;
    } else {
      nextFiles[f.fileName] = {
        fileName: f.fileName,
        bytes: f.bytes,
        mtimeMs: f.mtimeMs,
        duration:
          prev && prev.bytes === f.bytes && prev.mtimeMs === f.mtimeMs ? prev.duration : 0,
      };
      if (!nextFiles[f.fileName].duration) toProbe.push(f.fileName);
    }
  }

  let probed = 0;
  const started = Date.now();
  for (const fileName of toProbe) {
    if (Date.now() - started > probeBudgetMs) break;
    const full = path.join(MUSIC_DIR, fileName);
    try {
      const duration = await probeDuration(full);
      nextFiles[fileName] = {
        ...nextFiles[fileName],
        duration: duration > 0 ? duration : 0.5,
      };
      probed += 1;
    } catch {
      nextFiles[fileName] = { ...nextFiles[fileName], duration: 0.5 };
      probed += 1;
    }
  }

  saveManifest({ updatedAt: Date.now(), files: nextFiles });

  const items: MusicFolderItem[] = disk.map((f) => {
    const mediaId = musicMediaId(f.fileName);
    const duration = nextFiles[f.fileName]?.duration || 0;
    return {
      id: mediaId,
      fileName: f.fileName,
      mediaId,
      mediaUrl: `/api/music/file/${encodeURIComponent(f.fileName)}`,
      duration,
      bytes: f.bytes,
      mtimeMs: f.mtimeMs,
    };
  });

  return { items, probed, folder: MUSIC_DIR };
}
