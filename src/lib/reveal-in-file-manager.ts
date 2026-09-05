import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";
import { PROJECT_EXPORTS_DIR } from "./paths";

function isInsideExports(absPath: string): boolean {
  const exportsRoot = path.resolve(PROJECT_EXPORTS_DIR);
  const rel = path.relative(exportsRoot, absPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Walk up to an existing file/dir still inside exports/. */
export function existingExportRevealTarget(absPath: string): string | null {
  const exportsRoot = path.resolve(PROJECT_EXPORTS_DIR);
  let current = absPath;
  while (isInsideExports(current)) {
    if (existsSync(current)) return current;
    if (current === exportsRoot) return existsSync(exportsRoot) ? exportsRoot : null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return existsSync(exportsRoot) ? exportsRoot : null;
}

type Opener = { command: string; args: string[] };

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}

/**
 * Spawn a launcher CLI (e.g. `gio open`, `xdg-open`) that exits shortly after
 * handing the folder off to a file manager, and resolve with its exit code so
 * callers can fall through when it fails. A launcher that merely spawns is not
 * proof the folder opened, so we inspect the exit status here.
 */
function spawnAndWait(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 0));
  });
}

/** Try each opener in order; succeed on the first that launches. */
async function spawnFirstAvailable(openers: Opener[]): Promise<void> {
  let lastError: unknown = null;
  for (const opener of openers) {
    try {
      await spawnDetached(opener.command, opener.args);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No file manager was available to open the folder.");
}

/**
 * Open Explorer / Finder / the Linux file manager showing the export's folder.
 * We always fall back to opening the containing folder, and try several file
 * managers on Linux, so pressing the saved-path link reliably opens something.
 */
export async function revealPathInFileManager(absPath: string): Promise<void> {
  const target = existingExportRevealTarget(absPath);
  if (!target) {
    throw new Error("Export file was not found on disk.");
  }

  const isFile = existsSync(target) && statSync(target).isFile();
  const dir = isFile ? path.dirname(target) : target;

  if (process.platform === "win32") {
    const openers: Opener[] = [];
    if (isFile) {
      // Must be a SINGLE argument: `explorer /select,C:\path`. Passing
      // "/select," and the path as two args puts a space before the path,
      // which makes Explorer ignore the select and open the default folder.
      openers.push({ command: "explorer", args: [`/select,${target}`] });
    }
    // Fallback (and the not-a-file case): just open the containing folder.
    openers.push({ command: "explorer", args: [dir] });
    await spawnFirstAvailable(openers);
    return;
  }

  if (process.platform === "darwin") {
    const openers: Opener[] = [];
    if (isFile) openers.push({ command: "open", args: ["-R", target] });
    openers.push({ command: "open", args: [dir] });
    await spawnFirstAvailable(openers);
    return;
  }

  // Linux: first try the freedesktop launcher CLIs and check their exit code,
  // since on some desktops they return "success" while doing nothing useful.
  // Then fall back to launching common file managers directly by name.
  for (const launcher of [
    { command: "gio", args: ["open", dir] },
    { command: "xdg-open", args: [dir] },
  ]) {
    try {
      const code = await spawnAndWait(launcher.command, launcher.args);
      if (code === 0) return;
    } catch {
      // launcher not installed — try the next option
    }
  }

  await spawnFirstAvailable([
    { command: "nautilus", args: [dir] },
    { command: "dolphin", args: [dir] },
    { command: "nemo", args: [dir] },
    { command: "thunar", args: [dir] },
    { command: "pcmanfm", args: [dir] },
    { command: "caja", args: [dir] },
    { command: "xdg-open", args: [`file://${dir}`] },
  ]);
}
