import { existsSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import os from "os";

const HOME = process.env.HOME || os.homedir();

const BIN_CANDIDATES: Record<string, string[]> = {
  ffmpeg: [
    process.env.FFMPEG_PATH || "",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/opt/local/bin/ffmpeg",
    path.join(HOME, "bin/ffmpeg"),
  ],
  ffprobe: [
    process.env.FFPROBE_PATH || "",
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/opt/homebrew/bin/ffprobe",
    "/opt/local/bin/ffprobe",
    path.join(HOME, "bin/ffprobe"),
  ],
  "yt-dlp": [
    process.env.YT_DLP_PATH || "",
    path.join(HOME, ".local/bin/yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    path.join(HOME, "bin/yt-dlp"),
  ],
  python3: [
    process.env.PYTHON_PATH || "",
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  ],
};

const EXTRA_PATH = [
  "/usr/bin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/opt/local/bin",
  path.join(HOME, ".local/bin"),
  path.join(HOME, "bin"),
  process.env.PATH || "",
].filter(Boolean).join(path.delimiter);

const cache = new Map<string, string>();

function looksExecutable(filePath: string) {
  try {
    return existsSync(filePath);
  } catch {
    return false;
  }
}

export function resolveBinary(name: keyof typeof BIN_CANDIDATES | string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const candidates = BIN_CANDIDATES[name] || [];
  for (const candidate of candidates) {
    if (candidate && looksExecutable(candidate)) {
      cache.set(name, candidate);
      return candidate;
    }
  }

  try {
    const found = execFileSync("/bin/sh", ["-lc", `command -v ${name}`], {
      encoding: "utf8",
      env: { ...process.env, PATH: EXTRA_PATH },
    })
      .trim()
      .split("\n")[0];
    if (found && looksExecutable(found)) {
      cache.set(name, found);
      return found;
    }
  } catch {
    // fall through
  }

  throw new Error(
    `Could not find "${name}" on this machine (spawn ENOENT). Install it and ensure it is on PATH, or set ${name.toUpperCase().replace("-", "_")}_PATH.\n` +
      `macOS: brew install ffmpeg yt-dlp\n` +
      `Ubuntu: sudo apt install ffmpeg && pip install yt-dlp\n` +
      `Searched PATH: ${EXTRA_PATH}`
  );
}

export function toolEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    PATH: EXTRA_PATH,
  };
}

export function whichTools() {
  const tools = ["ffmpeg", "ffprobe", "yt-dlp", "python3"] as const;
  const result: Record<string, { ok: boolean; path?: string; error?: string }> = {};
  for (const tool of tools) {
    try {
      result[tool] = { ok: true, path: resolveBinary(tool) };
    } catch (e) {
      result[tool] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return result;
}
