import assert from "node:assert/strict";

const MAX_CLIP_GAP = 10;

function clampClipGap(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(MAX_CLIP_GAP, Math.max(0, Math.round(seconds * 20) / 20));
}

function getClipGapAfter(clip) {
  return clampClipGap(typeof clip.gapAfter === "number" ? clip.gapAfter : 0);
}

function clipPlayDuration(clip) {
  return Math.max(0.2, clip.source || 4);
}

function getPlaybackOrder(clips) {
  return clips.filter((c) => c.status === "ready");
}

function clipTimelineOffsets(clips) {
  const order = getPlaybackOrder(clips);
  let t = 0;
  return order.map((c, i) => {
    const duration = clipPlayDuration(c);
    const gapAfter = i < order.length - 1 ? getClipGapAfter(c) : 0;
    const row = { clipId: c.id, start: t, duration, gapAfter };
    t += duration + gapAfter;
    return row;
  });
}

function totalTimelineDuration(clips) {
  return clipTimelineOffsets(clips).reduce((s, o) => s + o.duration + o.gapAfter, 0);
}

function findClipAtAbsoluteTime(absTime, offsets) {
  const t = Math.max(0, absTime);
  for (const o of offsets) {
    const end = o.start + o.duration + o.gapAfter;
    if (t >= o.start && t < end) {
      return { ...o, inGap: t >= o.start + o.duration && o.gapAfter > 0 };
    }
  }
  return null;
}

// Gap clamp
assert.equal(clampClipGap(-1), 0);
assert.equal(clampClipGap(0.25), 0.25);
assert.equal(clampClipGap(99), 10);

// Timeline inserts gap between clips (not after last)
const clips = [
  { id: "a", status: "ready", source: 4, gapAfter: 1.5 },
  { id: "b", status: "ready", source: 3, gapAfter: 9 },
];
const offsets = clipTimelineOffsets(clips);
assert.equal(offsets[0].duration, 4);
assert.equal(offsets[0].gapAfter, 1.5);
assert.equal(offsets[1].start, 5.5);
assert.equal(offsets[1].gapAfter, 0, "last clip gap ignored");
assert.equal(totalTimelineDuration(clips), 8.5);

const mid = findClipAtAbsoluteTime(4.7, offsets);
assert.equal(mid.clipId, "a");
assert.equal(mid.inGap, true);

const inClip = findClipAtAbsoluteTime(2, offsets);
assert.equal(inClip.clipId, "a");
assert.equal(inClip.inGap, false);

// SFX default trim uses full duration (not 1.5 / 0.5)
function defaultTrimEnd(assetDuration, placementTrim) {
  const fullDur = assetDuration > 0 ? assetDuration : 1;
  return Math.min(
    fullDur,
    placementTrim != null && Number.isFinite(placementTrim)
      ? Math.max(0.05, placementTrim)
      : fullDur
  );
}
assert.equal(defaultTrimEnd(3.2, undefined), 3.2);
assert.equal(defaultTrimEnd(0.5, undefined), 0.5);
assert.equal(defaultTrimEnd(3.2, 1), 1);

// Manifest trust: fake 0.5 without probedOk must re-probe
function cachedDurationOk(prev, f) {
  if (!prev) return false;
  if (prev.bytes !== f.bytes || prev.mtimeMs !== f.mtimeMs) return false;
  if (!(prev.duration > 0)) return false;
  if (!prev.probedOk) return false;
  return true;
}
assert.equal(
  cachedDurationOk({ bytes: 1, mtimeMs: 1, duration: 0.5 }, { bytes: 1, mtimeMs: 1 }),
  false,
  "legacy fake 0.5 re-probes"
);
assert.equal(
  cachedDurationOk(
    { bytes: 1, mtimeMs: 1, duration: 2.4, probedOk: true },
    { bytes: 1, mtimeMs: 1 }
  ),
  true
);

console.log("sfx duration + black gap tests passed");
