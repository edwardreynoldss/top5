import assert from "node:assert/strict";

const MAX_HOOK_DURATION = 3;
const MIN_HOOK_DURATION = 0.5;
const MAX_CLIP_DURATION = 60;

function normalizeHook(hook, sourceDuration = Infinity) {
  if (!hook) return undefined;
  if (!Number.isFinite(hook.start) || !Number.isFinite(hook.end)) return undefined;
  const maxEnd =
    Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Infinity;
  let start = Math.max(0, hook.start);
  let end = Math.max(start + MIN_HOOK_DURATION, hook.end);
  if (Number.isFinite(maxEnd)) {
    end = Math.min(end, maxEnd);
    start = Math.min(start, Math.max(0, end - MIN_HOOK_DURATION));
  }
  let len = end - start;
  if (len < MIN_HOOK_DURATION - 1e-6) return undefined;
  if (len > MAX_HOOK_DURATION) {
    end = start + MAX_HOOK_DURATION;
  }
  return { start, end };
}

function hookDuration(hook) {
  if (!hook) return 0;
  return Math.max(0, hook.end - hook.start);
}

function getClipMainSegments(clip) {
  if (clip.segments?.length) return clip.segments;
  return [{ start: clip.trimStart, end: clip.trimEnd }];
}

function getClipPlaybackSegments(clip) {
  const main = getClipMainSegments(clip);
  const hook = normalizeHook(clip.hook, clip.duration || Infinity);
  if (!hook) return main;
  return [{ start: hook.start, end: hook.end }, ...main];
}

function segmentsDuration(segs) {
  return segs.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

function clipSourceDuration(clip) {
  const main = Math.min(MAX_CLIP_DURATION, segmentsDuration(getClipMainSegments(clip)));
  const hook = hookDuration(normalizeHook(clip.hook, clip.duration || Infinity));
  return Math.max(0.2, main + hook);
}

assert.equal(normalizeHook(null), undefined);
assert.equal(normalizeHook({ start: NaN, end: 1 }), undefined);
// Too-short ranges expand to the minimum hook length
assert.deepEqual(normalizeHook({ start: 0, end: 0.1 }), { start: 0, end: 0.5 });
// Impossible when source is shorter than min
assert.equal(normalizeHook({ start: 0, end: 0.1 }, 0.2), undefined);

const capped = normalizeHook({ start: 1, end: 10 }, 20);
assert.equal(capped.start, 1);
assert.equal(capped.end, 4);
assert.equal(hookDuration(capped), 3);

const clip = {
  trimStart: 10,
  trimEnd: 14,
  segments: [{ start: 10, end: 14 }],
  duration: 60,
  hook: { start: 2, end: 3.5 },
};

const playback = getClipPlaybackSegments(clip);
assert.equal(playback.length, 2);
assert.deepEqual(
  { start: playback[0].start, end: playback[0].end },
  { start: 2, end: 3.5 }
);
assert.deepEqual(
  { start: playback[1].start, end: playback[1].end },
  { start: 10, end: 14 }
);

const mainOnly = getClipMainSegments(clip);
assert.equal(mainOnly.length, 1);
assert.equal(clipSourceDuration(clip), 5.5, "main 4s + hook 1.5s");

const noHook = { ...clip, hook: undefined };
assert.equal(getClipPlaybackSegments(noHook).length, 1);
assert.equal(clipSourceDuration(noHook), 4);

// Export expand: hook prepended like TopBar
const exportRanges = getClipPlaybackSegments(clip).map((s) => ({
  start: s.start,
  end: s.end,
}));
assert.equal(exportRanges[0].start, 2);
assert.equal(exportRanges[1].start, 10);

console.log("clip hook tests passed");
