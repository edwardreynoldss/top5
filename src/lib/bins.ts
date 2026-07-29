import { existsSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import os from "os";

const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir();
const IS_WIN = process.platform === "win32";
const LOCAL = process.env.LOCALAPPDATA || "";
const PROG = process.env.PROGRAMFILES || "C:\\Program Files";
const PROG86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";

function win(name: string) {
  return IS_WIN ? `${name}.exe` : name;
}

const BIN_CANDIDATES: Record<string, string[]> = {
  ffmpeg: [
    process.env.FFMPEG_PATH || "",
    path.join(PROG, "ffmpeg", "bin", win("ffmpeg")),
    path.join(PROG86, "ffmpeg", "bin", win("ffmpeg")),
    path.join(LOCAL, "Microsoft", "WinGet", "Links", win("ffmpeg")),
    path.join(HOME, "scoop", "shims", win("ffmpeg")),
    path.join(HOME, "AppData", "Local", "Microsoft", "WinGet", "Links", win("ffmpeg")),
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    path.join(HOME, "bin", win("ffmpeg")),
  ],
  ffprobe: [
    process.env.FFPROBE_PATH || "",
    path.join(PROG, "ffmpeg", "bin", win("ffprobe")),
    path.join(PROG86, "ffmpeg", "bin", win("ffprobe")),
    path.join(LOCAL, "Microsoft", "WinGet", "Links", win("ffprobe")),
    path.join(HOME, "scoop", "shims", win("ffprobe")),
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/opt/homebrew/bin/ffprobe",
    path.join(HOME, "bin", win("ffprobe")),
  ],
  "yt-dlp": [
    process.env.YT_DLP_PATH || "",
    path.join(LOCAL, "Microsoft", "WinGet", "Links", win("yt-dlp")),
    path.join(HOME, "scoop", "shims", win("yt-dlp")),
    path.join(HOME, "AppData", "Local", "Programs", "Python", "Python312", "Scripts", win("yt-dlp")),
    path.join(HOME, "AppData", "Local", "Programs", "Python", "Python311", "Scripts", win("yt-dlp")),
    path.join(HOME, ".local", "bin", "yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    path.join(HOME, "bin", win("yt-dlp")),
  ],
  python3: [
    process.env.PYTHON_PATH || "",
    path.join(HOME, "AppData", "Local", "Programs", "Python", "Python312", win("python")),
    path.join(HOME, "AppData", "Local", "Programs", "Python", "Python311", win("python")),
    path.join(PROG, "Python312", win("python")),
    path.join(PROG, "Python311", win("python")),
    "C:\\Windows\\py.exe",
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  ],
};

const EXTRA_PATH = [
  path.join(PROG, "ffmpeg", "bin"),
  path.join(PROG86, "ffmpeg", "bin"),
  path.join(LOCAL, "Microsoft", "WinGet", "Links"),
  path.join(HOME, "scoop", "shims"),
  path.join(HOME, "AppData", "Local", "Programs", "Python", "Python312"),
  path.join(HOME, "AppData", "Local", "Programs", "Python", "Python312", "Scripts"),
  path.join(HOME, "AppData", "Local", "Programs", "Python", "Python311"),
  path.join(HOME, "AppData", "Local", "Programs", "Python", "Python311", "Scripts"),
  "/usr/bin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
  path.join(HOME, ".local", "bin"),
  path.join(HOME, "bin"),
  process.env.PATH || "",
]
  .filter(Boolean)
  .join(path.delimiter);

const cache = new Map<string, string>();

function looksExecutable(filePath: string) {
  try {
    return Boolean(filePath) && existsSync(filePath);
  } catch {
    return false;
  }
}

function commandNames(name: string) {
  if (!IS_WIN) return [name];
  if (name === "python3") return ["python", "python3", "py"];
  return [name, `${name}.exe`];
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

  for (const cmd of commandNames(name)) {
    try {
      const finder = IS_WIN ? "where" : "/bin/sh";
      const finderArgs = IS_WIN ? [cmd] : ["-lc", `command -v ${cmd}`];
      const found = execFileSync(finder, finderArgs, {
        encoding: "utf8",
        env: { ...process.env, PATH: EXTRA_PATH },
        windowsHide: true,
      })
        .trim()
        .split(/\r?\n/)[0];
      if (found && looksExecutable(found)) {
        cache.set(name, found);
        return found;
      }
    } catch {
      // try next
    }
  }

  throw new Error(
    `Could not find "${name}" on this machine (spawn ENOENT). Install it and ensure it is on PATH.\n` +
      `Windows (PowerShell as Admin or normal):\n` +
      `  winget install Gyan.FFmpeg\n` +
      `  winget install yt-dlp.yt-dlp\n` +
      `  winget install Python.Python.3.12\n` +
      `  pip install pillow yt-dlp\n` +
      `Then close + reopen your terminal and restart the app.\n` +
      `Or set FFMPEG_PATH / YT_DLP_PATH / PYTHON_PATH to the full .exe path.`
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
