import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function nextExportNumber(dir, prefix = "ranking-short") {
  fs.mkdirSync(dir, { recursive: true });
  let max = 0;
  for (const name of fs.readdirSync(dir)) {
    const m = new RegExp(`^${prefix}-(\\d+)\\.mp4$`, "i").exec(name);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rank-exports-"));
assert.equal(nextExportNumber(dir), 1);
fs.writeFileSync(path.join(dir, "ranking-short-1.mp4"), "x");
fs.writeFileSync(path.join(dir, "ranking-short-3.mp4"), "x");
fs.writeFileSync(path.join(dir, "notes.txt"), "ignore");
assert.equal(nextExportNumber(dir), 4);
fs.writeFileSync(path.join(dir, "ranking-short-4.mp4"), "x");
assert.equal(nextExportNumber(dir), 5);

console.log("export numbering tests passed");
