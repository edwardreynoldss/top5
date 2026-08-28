import assert from "node:assert/strict";

function clipTimelineOffsets(clips) {
  let t = 0;
  return clips.map((c, i) => {
    const duration = c.duration;
    const gapAfter = i < clips.length - 1 ? c.gapAfter || 0 : 0;
    const row = { clipId: c.id, start: t, duration, gapAfter };
    t += duration + gapAfter;
    return row;
  });
}

function findClipAtAbsoluteTime(absTime, offsets) {
  if (offsets.length === 0) return null;
  const t = Math.max(0, absTime);
  for (const o of offsets) {
    const gap = Math.max(0, o.gapAfter || 0);
    const end = o.start + o.duration + gap;
    if (t >= o.start && t < end) {
      return { ...o, inGap: t >= o.start + o.duration - 1e-6 && gap > 0 };
    }
  }
  return offsets[offsets.length - 1];
}

function pinSfxToClip(absTime, offsets) {
  const startAt = Math.max(0, Number.isFinite(absTime) ? absTime : 0);
  const hit = findClipAtAbsoluteTime(startAt, offsets);
  if (!hit) return { clipId: null, offsetInClip: 0, startAt };
  const maxOff = Math.max(0, hit.duration - 0.05);
  const offsetInClip = Math.max(0, Math.min(startAt - hit.start, maxOff));
  return { clipId: hit.clipId, offsetInClip, startAt };
}

function resolveSfxStartAt(placement, offsets) {
  if (placement.clipId) {
    const hit = offsets.find((o) => o.clipId === placement.clipId);
    if (hit) {
      return (
        hit.start +
        Math.max(0, Math.min(placement.offsetInClip, Math.max(0, hit.duration - 0.05)))
      );
    }
  }
  return Math.max(0, placement.startAt);
}

const rank5 = { id: "c5", duration: 4, gapAfter: 0 };
const rank3 = { id: "c3", duration: 4, gapAfter: 0 };
const rank4 = { id: "c4", duration: 3, gapAfter: 0 };

// Place on rank 5 (first in countdown) at 1.5s into the clip
{
  const offsets = clipTimelineOffsets([rank5, rank4, rank3]);
  const pin = pinSfxToClip(1.5, offsets);
  assert.equal(pin.clipId, "c5");
  assert.equal(pin.offsetInClip, 1.5);
  assert.equal(resolveSfxStartAt(pin, offsets), 1.5);
}

// Swap 5 and 3 — pinned hit rides with clip 5 to the later slot
{
  const before = clipTimelineOffsets([rank5, rank4, rank3]);
  const pin = pinSfxToClip(1.5, before);
  const after = clipTimelineOffsets([rank3, rank4, rank5]);
  assert.equal(resolveSfxStartAt(pin, after), 3 + 4 + 1.5);
  // Old absolute startAt would have stayed at 1.5 (now on rank 3)
  assert.equal(resolveSfxStartAt({ clipId: null, offsetInClip: 0, startAt: 1.5 }, after), 1.5);
}

// Hit on rank 3 (third clip, starts at 7) stays with rank 3 after a swap
{
  const before = clipTimelineOffsets([rank5, rank4, rank3]);
  assert.equal(before[2].start, 7);
  const pin = pinSfxToClip(7.8, before);
  assert.equal(pin.clipId, "c3");
  assert.ok(Math.abs(pin.offsetInClip - 0.8) < 1e-9);
  const after = clipTimelineOffsets([rank3, rank4, rank5]);
  assert.ok(Math.abs(resolveSfxStartAt(pin, after) - 0.8) < 1e-9);
}

// Empty timeline stays absolute
{
  const pin = pinSfxToClip(2, []);
  assert.equal(pin.clipId, null);
  assert.equal(pin.startAt, 2);
}

console.log("sfx clip-pin tests passed");
