/**
 * Dev helper: upload 5 generated clips and archive a project that plays them
 * 4 → 2 → 1 → 5 → 3, so the custom play order can be checked in the editor.
 * Open it in the app with "Open previous".
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const outDir = path.resolve("tmp/custom-order-demo");
fs.mkdirSync(outDir, { recursive: true });

const LABELS = {
  1: "Golden Retriever",
  2: "Border Collie",
  3: "Corgi",
  4: "Husky",
  5: "Shiba Inu",
};
const PLAY_SEQUENCE = [4, 2, 1, 5, 3];
const EDITOR_RANKS = [5, 4, 3, 2, 1];

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

const HUES = { 1: "orange", 2: "navy", 3: "darkgreen", 4: "purple", 5: "maroon" };
const byRank = new Map();
for (const rank of EDITOR_RANKS) {
  const file = path.join(outDir, `clip${rank}.mp4`);
  ff([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${HUES[rank]}:s=720x1280:r=30`,
    "-t",
    "2",
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
  byRank.set(rank, up);
}

const clips = EDITOR_RANKS.map((rank) => {
  const up = byRank.get(rank);
  return {
    id: randomUUID(),
    rank,
    label: LABELS[rank],
    inDepthText: "",
    score: "",
    mediaId: up.mediaId,
    mediaUrl: up.mediaUrl,
    fileName: up.fileName || `clip${rank}.mp4`,
    sourceUrl: null,
    duration: up.duration ?? 2,
    trimStart: 0,
    trimEnd: 1.2,
    segments: [{ id: randomUUID(), start: 0, end: 1.2, speed: 1 }],
    volume: 1,
    speed: 1,
    gapAfter: 0,
    hookGapAfter: 0,
    status: "ready",
  };
});

const idByRank = new Map(clips.map((c) => [c.rank, c.id]));
const project = {
  clips,
  sfxAssets: [],
  sfxPlacements: [],
  overlayPlacements: [],
  exportSlot: null,
  settings: {
    playOrder: "custom",
    customOrder: PLAY_SEQUENCE.map((rank) => idByRank.get(rank)),
    rankListOrder: "auto",
    showRankList: true,
    showActiveLabel: true,
    title: {
      enabled: true,
      showBar: true,
      lines: [
        {
          id: randomUUID(),
          words: [
            { id: randomUUID(), text: "TOP 5", color: "#FFFFFF" },
            { id: randomUUID(), text: "DOGS", color: "#FFD400" },
          ],
        },
      ],
    },
  },
};

const res = await fetch(`${base}/api/projects/archives`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    project,
    reason: "manual",
    force: true,
    channelSlug: "custom-order-demo",
    channelName: "Custom order demo",
    label: "custom-order-demo (plays 4-2-1-5-3)",
  }),
});
const data = await res.json();
assert.ok(res.ok, data.error || JSON.stringify(data));
console.log("archived:", data.meta?.id, data.meta?.label);
console.log("open it in the app via “Open previous”");
