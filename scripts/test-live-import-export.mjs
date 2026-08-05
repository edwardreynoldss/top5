/**
 * Live smoke: POST /api/upload (MP4) then POST /api/export with 2 clips.
 * Verifies response + that the saved file is yuv420p High and playable.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const outDir = path.resolve("tmp/live-ie-test");
fs.mkdirSync(outDir, { recursive: true });

function ff(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stderr || "").slice(-600));
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
  const s = JSON.parse(r.stdout).streams[0];
  return { pix: s.pix_fmt, profile: s.profile };
}

const clip1 = path.join(outDir, "c1.mp4");
const clip2 = path.join(outDir, "c2.mp4");
ff([
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=720x1280:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=44100",
  "-t",
  "1.5",
  "-pix_fmt",
  "yuv420p",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-c:a",
  "aac",
  clip1,
]);
ff([
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=720x1280:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=550:sample_rate=44100",
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
  clip2,
]);

async function upload(filePath, name) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "video/mp4" }), name);
  const t0 = Date.now();
  const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
  const ms = Date.now() - t0;
  const data = await res.json();
  assert.ok(res.ok, data.error || JSON.stringify(data));
  assert.ok(data.mediaId?.endsWith(".mp4"));
  assert.ok(data.duration > 1);
  console.log(`upload ${name}: ${ms}ms → ${data.mediaId} (${data.duration.toFixed(2)}s)`);
  return { ...data, ms };
}

const u1 = await upload(clip1, "clip1.mp4");
const u2 = await upload(clip2, "clip2.mp4");

const body = {
  clips: [
    {
      mediaId: u1.mediaId,
      rank: 2,
      label: "Two",
      trimStart: 0,
      trimEnd: 1.0,
      volume: 1,
      speed: 1,
    },
    {
      mediaId: u2.mediaId,
      rank: 1,
      label: "One",
      trimStart: 0,
      trimEnd: 0.8,
      volume: 1,
      speed: 1,
    },
  ],
  title: {
    enabled: true,
    showBar: true,
    barHeight: 120,
    text: "FAST TEST",
    fontSize: 64,
  },
  ranksLayout: {},
  playOrder: "countdown",
  transition: "flash",
  transitionDuration: 0.25,
  aspectMode: "crop-fill",
  blurAmount: 28,
  titleOverlap: true,
  showRankList: true,
  showActiveLabel: true,
  rankColors: { 1: "#FF3B5C", 2: "#FF8A00" },
  musicMediaId: null,
  musicVolume: 0.35,
  clipVolume: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  channelExport: {
    channelSlug: "fast-test",
    number: 1,
    version: 1,
  },
  sfx: [],
};

const tExp0 = Date.now();
const expRes = await fetch(`${base}/api/export`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const expMs = Date.now() - tExp0;
const exp = await expRes.json();
assert.ok(expRes.ok, exp.error || JSON.stringify(exp));
assert.ok(exp.savedPath || exp.fileName, JSON.stringify(exp));
console.log(`export ok in ${expMs}ms → ${exp.savedPath || exp.fileName}`);

const saved = exp.savedPath
  ? path.resolve(exp.savedPath)
  : path.resolve("exports", exp.fileName);
assert.ok(fs.existsSync(saved), `missing export file ${saved}`);
const p = probe(saved);
assert.equal(p.pix, "yuv420p");
assert.equal(p.profile, "High");
const size = fs.statSync(saved).size;
assert.ok(size > 20_000, `export too small: ${size}`);
console.log(`probe ${p.pix} / ${p.profile}, size=${size}`);
console.log("test-live-import-export: OK");
