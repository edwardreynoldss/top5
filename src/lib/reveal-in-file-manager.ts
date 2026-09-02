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

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Open Explorer / Finder / the file manager at this path (select file when possible). */
export async function revealPathInFileManager(absPath: string): Promise<void> {
  const target = existingExportRevealTarget(absPath);
  if (!target) {
    throw new Error("Export file was not found on disk.");
  }

  const isFile = existsSync(target) && statSync(target).isFile();
  const dir = isFile ? path.dirname(target) : target;

  if (process.platform === "win32") {
    if (isFile) {
      // `/select,` + path as two args so spaces in the path still work.
      await spawnDetached("explorer", ["/select,", target]);
    } else {
      await spawnDetached("explorer", [dir]);
    }
    return;
  }

  if (process.platform === "darwin") {
    if (isFile) {
      await spawnDetached("open", ["-R", target]);
    } else {
      await spawnDetached("open", [dir]);
    }
    return;
  }

  await spawnDetached("xdg-open", [dir]);
}
