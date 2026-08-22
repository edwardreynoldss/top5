/**
 * Live check: export with In Depth Ranking on and confirm the overlay configs
 * the renderer consumed show each clip's description while it plays and
 * "Name - 8.11/10" once it has played.
 *
 * Needs the dev server running (APP_URL, default http://127.0.0.1:3000).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const outDir = path.resolve("tmp/clip-description-score-test");
fs.mkdirSync(outDir, { recursive: true });

const PLAYBACK_RANKS = [5, 4, 3, 2, 1];
const CLIP_TEXT = {
  1: { label: "Goat Yelling", inDepthText: "Volume up for this one", score: "" },
  2: { label: "Dog Sliding", inDepthText: "Wait for the landing", score: "9" },
  3: { label: "Bird Diving", inDepthText: "Straight into the pond", score: "7.5/10" },
  4: { label: "Fox Jumping", inDepthText: "", score: "6.25" },
  5: { label: "Cat Running", inDepthText: "This Cat does NOT care 😂", score: "8.11" },
};

/** Mirrors clipShortText/formatClipScore in src/lib/defaults.ts */
function shortText(rank) {
  const { label, score } = CLIP_TEXT[rank];
  const trimmed = score.trim();
  const suffixed = !trimmed
    ? ""
    : /^\d+(?:[.,]\d+)?$/.test(trimmed)
      ? `${trimmed}/10`
      : trimmed;
  if (label && suffixed) return `${label} - ${suffixed}`;
  return label || suffixed;
}

function longText(rank) {
  const { label, inDepthText } = CLIP_TEXT[rank];
  return inDepthText.trim() || label.trim();
}

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
    "testsrc=size=720x1280:rate=30:decimals=2",
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
    ...CLIP_TEXT[rank],
    trimStart: 0,
    trimEnd: 0.8,
    volume: 1,
    speed: 1,
  });
}

const body = {
  clips,
  title: { enabled: true, showBar: true, barHeight: 120, fontSize: 64, lines: [] },
  ranksLayout: { labelActiveOpacity: 1, inDepthFadeTo: 0.45 },
  playOrder: "countdown",
  rankListRanks: PLAYBACK_RANKS,
  inDepthRanking: true,
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
  channelExport: { channelSlug: "clip-description-score", number: 1, version: 1 },
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
  const playing = PLAYBACK_RANKS[i];
  const playedSoFar = new Set(PLAYBACK_RANKS.slice(0, i + 1));
  for (const row of cfg.ranks) {
    const expected = !playedSoFar.has(row.rank)
      ? ""
      : row.rank === playing
        ? longText(row.rank)
        : shortText(row.rank);
    assert.equal(
      row.label,
      expected,
      `clip ${i}: rank ${row.rank} should read ${JSON.stringify(expected)}`
    );
  }
  console.log(
    `clip ${i} (playing #${playing}):`,
    cfg.ranks.map((r) => `${r.rank}.${r.label ? ` ${r.label}` : ""}`).join("  |  ")
  );
}

// The user's example, spelled out: the score box holds "8.11", the video reads "/10"
const firstCfg = JSON.parse(
  fs.readFileSync(path.join(jobDir, "overlay-0.json"), "utf8")
);
assert.equal(
  firstCfg.ranks.find((r) => r.rank === 5).label,
  "This Cat does NOT care 😂",
  "rank 5 plays first, so it shows its description"
);
const lastCfg = JSON.parse(
  fs.readFileSync(path.join(jobDir, "overlay-4.json"), "utf8")
);
assert.equal(
  lastCfg.ranks.find((r) => r.rank === 5).label,
  "Cat Running - 8.11/10",
  "once played, the same rank reads name - score/10"
);
assert.equal(
  lastCfg.ranks.find((r) => r.rank === 3).label,
  "Bird Diving - 7.5/10",
  "a score saved with its own /10 is not doubled"
);
assert.equal(
  lastCfg.ranks.find((r) => r.rank === 1).label,
  "Volume up for this one",
  "rank 1 plays last, so it is still on its description"
);
assert.equal(
  firstCfg.ranks.find((r) => r.rank === 1).label,
  "",
  "a clip that has not played yet has no line at all"
);

console.log("live clip description & score test: OK");
