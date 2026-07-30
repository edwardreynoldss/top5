/**
 * Encode a short sample with the same compat flags as export and verify
 * players will accept it (yuv420p + High, not High 4:4:4).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("tmp/preview-test");
fs.mkdirSync(outDir, { recursive: true });
const src = path.join(outDir, "landscape.mp4");
const bad444 = path.join(outDir, "bad-444.mp4");
const good = path.join(outDir, "compat-out.mp4");

assert.ok(fs.existsSync(src), "landscape test mp4 missing");

// Simulate the old broken path: fade without pix_fmt → often yuv444
{
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      src,
      "-t",
      "1",
      "-vf",
      "fade=t=out:st=0.5:d=0.4:color=white",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-an",
      bad444,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr?.slice(-400));
}

function probe(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=pix_fmt,profile",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr);
  const stream = JSON.parse(r.stdout).streams[0];
  return { pix: stream.pix_fmt, profile: stream.profile };
}

const broken = probe(bad444);
console.log("broken fade encode", broken);
assert.ok(
  broken.pix.includes("444") || /4:4:4/i.test(broken.profile),
  "expected demo of unplayable 444 encode"
);

// Compat finalize (matches export route)
{
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      bad444,
      "-vf",
      "format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      good,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr?.slice(-500));
}

const fixed = probe(good);
console.log("compat encode", fixed);
assert.equal(fixed.pix, "yuv420p");
assert.equal(fixed.profile, "High");
assert.ok(!/4:4:4/i.test(fixed.profile));

// Progressive label reveal contract
function revealedLabels(orderedLabels, activeIndex) {
  return orderedLabels.map((label, idx) => (idx <= activeIndex ? label : ""));
}
assert.deepEqual(revealedLabels(["A", "B", "C"], 0), ["A", "", ""]);
assert.deepEqual(revealedLabels(["A", "B", "C"], 1), ["A", "B", ""]);
assert.deepEqual(revealedLabels(["A", "B", "C"], 2), ["A", "B", "C"]);

console.log("export compat + label reveal tests passed");
