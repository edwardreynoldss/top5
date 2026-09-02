import assert from "node:assert/strict";
import path from "node:path";

const PROJECT_EXPORTS_DIR = path.join(process.cwd(), "exports");

function safeExportRevealPath(rawPath) {
  if (typeof rawPath !== "string") return null;
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.includes("\0")) return null;

  const parts = trimmed
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .split("/")
    .filter((p) => p && p !== ".");
  if (parts.length === 0 || parts[0] !== "exports") return null;
  if (parts.some((p) => p === "..")) return null;

  const resolved = path.resolve(process.cwd(), ...parts);
  const exportsRoot = path.resolve(PROJECT_EXPORTS_DIR);
  const rel = path.relative(exportsRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

const animals = safeExportRevealPath("exports\\animals\\ranking-animals-38.mp4");
assert.equal(
  animals,
  path.resolve(process.cwd(), "exports", "animals", "ranking-animals-38.mp4")
);

assert.equal(
  safeExportRevealPath("exports/animals/ranking-animals-38.mp4"),
  path.resolve(process.cwd(), "exports", "animals", "ranking-animals-38.mp4")
);
assert.equal(safeExportRevealPath("exports"), path.resolve(process.cwd(), "exports"));
assert.equal(safeExportRevealPath("./exports/foo.mp4"), path.resolve(process.cwd(), "exports", "foo.mp4"));

assert.equal(safeExportRevealPath(""), null);
assert.equal(safeExportRevealPath("   "), null);
assert.equal(safeExportRevealPath("tmp/secret.mp4"), null);
assert.equal(safeExportRevealPath("/etc/passwd"), null);
assert.equal(safeExportRevealPath("exports/../package.json"), null);
assert.equal(safeExportRevealPath("exports/animals/../../package.json"), null);
assert.equal(safeExportRevealPath("exports/foo/../../../etc/passwd"), null);
assert.equal(safeExportRevealPath("C:\\Windows\\System32"), null);
assert.equal(safeExportRevealPath("exports\0animals"), null);

console.log("export reveal path tests passed");
