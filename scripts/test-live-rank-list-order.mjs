/**
 * Live check: export 5 clips with a custom playback sequence and confirm the
 * rank numbers on screen keep their own order while each label appears next to
 * its own number when that clip plays.
 *
 * Needs the dev server running (APP_URL, default http://127.0.0.1:3000).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const outDir = path.resolve("tmp/rank-list-order-test");
fs.mkdirSync(outDir, { recursive: true });

const PLAYBACK_RANKS = [4, 2, 1, 5, 3];
const SCREEN_RANKS = [5, 4, 3, 2, 1];
const LABELS = { 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five" };

function ff(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stderr || "").slice(-600));
}

async function upload(filePath, name) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync(filePath)], { type: "video/mp4" }),
    name
  );
  const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
  const data = await res.json();
  assert.ok(res.ok, data.error || JSON.stringify(data));
  return data;
}

const clips = [];
for (const rank of [1, 2, 3, 4, 5]) {
  const file = path.join(outDir, `clip${rank}.mp4`);
  ff([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=720x1280:rate=30:decimals=2`,
    "-t",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-an",
    file,
  ]);
  const up = await upload(file, `clip${rank}.mp4`);
  clips.push({
    mediaId: up.mediaId,
    rank,
    label: LABELS[rank],
    inDepthText: "",
    score: "",
    trimStart: 0,
    trimEnd: 0.8,
    volume: 1,
    speed: 1,
  });
}

// Server sorts by the ranks it is sent, so hand it the clips unsorted.
const body = {
  clips,
  title: { enabled: true, showBar: true, barHeight: 120, fontSize: 64, lines: [] },
  ranksLayout: {},
  playOrder: "custom",
  playbackRanks: PLAYBACK_RANKS,
  rankListRanks: SCREEN_RANKS,
  transition: "cut",
  transitionDuration: 0.2,
  aspectMode: "crop-fill",
  blurAmount: 28,
  titleOverlap: true,
  showRankList: true,
  showActiveLabel: true,
  rankColors: { 1: "#FF2D2D", 2: "#FF8A00", 3: "#FFD400", 4: "#FFFFFF", 5: "#FFFFFF" },
  musicMediaId: null,
  musicVolume: 0,
  clipVolume: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  channelExport: { channelSlug: "rank-list-order", number: 1, version: 1 },
  sfx: [],
};

const jobRoot = path.resolve("tmp/exports");
fs.mkdirSync(jobRoot, { recursive: true });
const before = new Set(fs.readdirSync(jobRoot));
const res = await fetch(`${base}/api/export`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const data = await res.json();
assert.ok(res.ok, data.error || JSON.stringify(data));
console.log(`export ok → ${data.savedPath || data.fileName}`);

// The job dir holds the per-clip overlay configs the Pillow renderer consumed.
const jobDirs = fs
  .readdirSync(jobRoot)
  .filter((f) => !before.has(f))
  .map((f) => path.join(jobRoot, f))
  .filter((p) => fs.statSync(p).isDirectory());
assert.equal(jobDirs.length, 1, `expected one new job dir, got ${jobDirs.length}`);
const jobDir = jobDirs[0];

for (let i = 0; i < PLAYBACK_RANKS.length; i++) {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(jobDir, `overlay-${i}.json`), "utf8")
  );
  const rows = cfg.ranks;
  assert.deepEqual(
    rows.map((r) => r.rank),
    SCREEN_RANKS,
    `clip ${i}: numbers must stay in screen order`
  );
  assert.equal(
    cfg.activeRank,
    PLAYBACK_RANKS[i],
    `clip ${i}: playing clip is rank ${PLAYBACK_RANKS[i]}`
  );
  const playedSoFar = new Set(PLAYBACK_RANKS.slice(0, i + 1));
  for (const row of rows) {
    const expected = playedSoFar.has(row.rank) ? LABELS[row.rank] : "";
    assert.equal(
      row.label,
      expected,
      `clip ${i}: rank ${row.rank} label should be ${JSON.stringify(expected)}`
    );
  }
  assert.ok(
    fs.existsSync(path.join(jobDir, `ranks-${i}.png`)),
    `clip ${i}: ranks overlay png missing`
  );
  console.log(
    `clip ${i} (playing #${PLAYBACK_RANKS[i]}):`,
    rows.map((r) => `${r.rank}.${r.label ? ` ${r.label}` : ""}`).join("  ")
  );
}

console.log("live rank list order test: OK");
