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
  return Number.isFinite(n) ? n : 0;
}
