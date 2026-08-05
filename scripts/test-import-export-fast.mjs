/**
 * Regression + speed check for faster import/export paths:
 * - MP4 upload keeps bytes (no remux)
 * - Final export remuxes with -c copy when segments are already compat
 * - Audio mix keeps -c:v copy
 * - Flash transition is baked into the first encode (no second pass)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = path.resolve(".");
const outDir = path.join(root, "tmp", "fast-path-test");
fs.mkdirSync(outDir, { recursive: true });

function ff(args, label = "ffmpeg") {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, `${label} failed:\n${(r.stderr || "").slice(-800)}`);
  return r;
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
      "stream=pix_fmt,profile,codec_name",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr);
  const stream = JSON.parse(r.stdout).streams[0];
  return {
    pix: stream.pix_fmt,
    profile: stream.profile,
    codec: stream.codec_name,
  };
}

function probeDur(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr);
  return parseFloat(r.stdout.trim());
}

const H264_COMPAT = [
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
];
const AAC = ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"];

// 1) Source clips
const clipA = path.join(outDir, "clip-a.mp4");
const clipB = path.join(outDir, "clip-b.mp4");
ff(
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "1.2",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    clipA,
  ],
  "clipA"
);
ff(
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=44100",
    "-t",
    "1.0",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    clipB,
  ],
  "clipB"
);

// 2) Upload fast path: write MP4 bytes directly (no ffmpeg remux)
const uploadId = randomUUID();
const uploadOut = path.join(outDir, `${uploadId}.mp4`);
const t0 = Date.now();
fs.copyFileSync(clipA, uploadOut);
const uploadMs = Date.now() - t0;
assert.ok(probeDur(uploadOut) > 1, "uploaded mp4 should keep duration");
console.log(`upload direct-write ok (${uploadMs}ms)`);

// Contrast: old remux path timing (sanity that direct write is not slower)
const remuxOut = path.join(outDir, "remux.mp4");
const t1 = Date.now();
ff(
  ["-y", "-i", clipA, "-c", "copy", "-movflags", "+faststart", remuxOut],
  "old-remux"
);
const remuxMs = Date.now() - t1;
console.log(`old remux ${remuxMs}ms vs direct ${uploadMs}ms`);
assert.ok(uploadMs <= remuxMs + 50, "direct write should not be slower than remux");

// 3) Encode two segments like export (compat), with flash baked into first
const seg0 = path.join(outDir, "seg-0.mp4");
const seg1 = path.join(outDir, "seg-1.mp4");
const titlePng = path.join(outDir, "title.png");
ff(
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0.0:s=1080x1920:d=1",
    "-frames:v",
    "1",
    titlePng,
  ],
  "title-png"
);

ff(
  [
    "-y",
    "-i",
    clipA,
    "-loop",
    "1",
    "-t",
    "1.0",
    "-i",
    titlePng,
    "-filter_complex",
    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[base];[base][1:v]overlay=0:0:shortest=1,format=yuv420p[prefx];[prefx]fade=t=out:st=0.7:d=0.3:color=white,format=yuv420p[vout];[0:a]volume=0.2,aresample=44100[aout]",
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...H264_COMPAT,
    ...AAC,
    "-t",
    "1.0",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    seg0,
  ],
  "seg0-flash"
);

ff(
  [
    "-y",
    "-i",
    clipB,
    "-loop",
    "1",
    "-t",
    "0.8",
    "-i",
    titlePng,
    "-filter_complex",
    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[base];[base][1:v]overlay=0:0:shortest=1,format=yuv420p[vout];[0:a]volume=0.2,aresample=44100[aout]",
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...H264_COMPAT,
    ...AAC,
    "-t",
    "0.8",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    seg1,
  ],
  "seg1"
);

for (const f of [seg0, seg1]) {
  const p = probe(f);
  assert.equal(p.pix, "yuv420p", f);
  assert.equal(p.profile, "High", f);
}

// 4) Concat + copy finalize (new fast path)
const list = path.join(outDir, "list.txt");
fs.writeFileSync(
  list,
  [seg0, seg1].map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
);
const concatOut = path.join(outDir, "concat.mp4");
ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", concatOut], "concat");

const finalCopy = path.join(outDir, "final-copy.mp4");
const tCopy0 = Date.now();
ff(
  ["-y", "-i", concatOut, "-c", "copy", "-movflags", "+faststart", finalCopy],
  "final-copy"
);
const copyMs = Date.now() - tCopy0;
const copyProbe = probe(finalCopy);
assert.equal(copyProbe.pix, "yuv420p");
assert.equal(copyProbe.profile, "High");
assert.ok(probeDur(finalCopy) > 1.5, "concat duration");

const finalRe = path.join(outDir, "final-reencode.mp4");
const tRe0 = Date.now();
ff(
  [
    "-y",
    "-i",
    concatOut,
    "-vf",
    "format=yuv420p",
    ...H264_COMPAT,
    ...AAC,
    "-movflags",
    "+faststart",
    finalRe,
  ],
  "final-reencode"
);
const reMs = Date.now() - tRe0;
console.log(`final copy ${copyMs}ms vs re-encode ${reMs}ms`);
assert.ok(copyMs < reMs, "copy finalize should beat full re-encode");

// 5) Mix path: -c:v copy + new audio
const sfx = path.join(outDir, "hit.mp3");
ff(
  ["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=0.2", "-q:a", "9", sfx],
  "sfx"
);
const mixed = path.join(outDir, "final-mix.mp4");
ff(
  [
    "-y",
    "-i",
    concatOut,
    "-i",
    sfx,
    "-filter_complex",
    "[0:a]volume=1,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];[1:a]atrim=start=0:duration=0.2,asetpts=PTS-STARTPTS,volume=1,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=200|200[s1];[a0][s1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]",
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    ...AAC,
    "-shortest",
    "-movflags",
    "+faststart",
    mixed,
  ],
  "mix-copy-v"
);
const mixProbe = probe(mixed);
assert.equal(mixProbe.pix, "yuv420p");
assert.equal(mixProbe.profile, "High");
assert.ok(probeDur(mixed) > 1.5);

console.log("test-import-export-fast: OK");
