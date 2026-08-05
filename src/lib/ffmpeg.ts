import { spawn } from "child_process";
import { resolveBinary, toolEnv } from "./bins";

export function runCommand(
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let bin = command;
    try {
      if (["ffmpeg", "ffprobe", "yt-dlp", "python3"].includes(command)) {
        bin = resolveBinary(command);
      }
    } catch (e) {
      reject(e);
      return;
    }

    const child = spawn(bin, args, {
      cwd: opts?.cwd,
      env: toolEnv(opts?.env),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start ${bin}: ${err.message}. If this is ENOENT, install ffmpeg/yt-dlp or set FFMPEG_PATH / YT_DLP_PATH.`
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} failed (${code}): ${(stderr || stdout).slice(-2000)}`));
    });
  });
}

export async function probeDuration(filePath: string): Promise<number> {
  // Prefer format duration; fall back to stream duration (some files tag format wrong/short).
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const n = parseFloat(stdout.trim());
    if (Number.isFinite(n) && n > 0.05) return n;
  } catch {
    // try stream below
  }
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const n = parseFloat(stdout.trim());
    if (Number.isFinite(n) && n > 0.05) return n;
  } catch {
    // ignore
  }
  return 0;
}

/** Video stream pix_fmt / profile — used to skip redundant final re-encodes. */
export async function probeVideoCompat(filePath: string): Promise<{
  pixFmt: string;
  profile: string;
}> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=pix_fmt,profile",
    "-of",
    "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ pix_fmt?: string; profile?: string }>;
  };
  const stream = parsed.streams?.[0];
  return {
    pixFmt: (stream?.pix_fmt || "").toLowerCase(),
    profile: stream?.profile || "",
  };
}

/** True when the file is already widely playable H.264 (yuv420p, not 4:4:4). */
export async function isCompatH264(filePath: string): Promise<boolean> {
  try {
    const { pixFmt, profile } = await probeVideoCompat(filePath);
    if (pixFmt !== "yuv420p") return false;
    if (/4:4:4/i.test(profile)) return false;
    return /high|main|baseline/i.test(profile);
  } catch {
    return false;
  }
}

/** Detect VP9/WebM (or other) streams that carry a real alpha channel. */
export async function probeHasAlpha(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=pix_fmt:stream_tags=alpha_mode,ALPHA_MODE",
      "-of",
      "json",
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        pix_fmt?: string;
        tags?: Record<string, string>;
      }>;
    };
    const stream = parsed.streams?.[0];
    if (!stream) return false;
    const pix = (stream.pix_fmt || "").toLowerCase();
    if (pix.includes("yuva") || pix.includes("rgba") || pix.includes("gbra")) return true;
    const tags = stream.tags || {};
    const mode = tags.alpha_mode || tags.ALPHA_MODE || "";
    return mode === "1" || mode.toLowerCase() === "true";
  } catch {
    return false;
  }
}
