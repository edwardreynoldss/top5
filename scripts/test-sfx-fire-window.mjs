import assert from "node:assert/strict";

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

function sfxTrimDuration(trimStart, trimEnd) {
  const ts = Math.max(0, trimStart ?? 0);
  const te = Math.max(ts + 0.05, trimEnd ?? ts + 1);
  return te - ts;
}

function sfxWindowEnd(start, trimStart, trimEnd) {
  return start + sfxTrimDuration(trimStart, trimEnd);
}

function sfxShouldCatchup(absNow, start, trimStart, trimEnd) {
  const end = sfxWindowEnd(start, trimStart, trimEnd);
  return !(absNow < start - 0.03 || absNow >= end - 0.02);
}

function sfxCrossedStart(prevAbs, absNow, start, trimStart, trimEnd) {
  const end = sfxWindowEnd(start, trimStart, trimEnd);
  if (absNow >= end - 0.02) return false;
  return prevAbs < start && start <= absNow;
}

const offsets = [{ clipId: "c1", start: 0, duration: 5 }];

// Absolute placement at 0.00s — catchup on play, not a live re-fire
{
  const start = resolveSfxStartAt({ clipId: null, offsetInClip: 0, startAt: 0 }, offsets);
  assert.equal(start, 0);
  assert.equal(sfxShouldCatchup(0, start, 0, 1.5), true, "must fire at exactly 0");
  assert.equal(sfxShouldCatchup(0.3, start, 0, 1.5), true, "resume still catches after 0.25s");
  assert.equal(sfxShouldCatchup(1.6, start, 0, 1.5), false, "must not fire after sample ends");
}

// Live playback only fires on the start crossing — not every frame inside the sample
{
  const start = 4;
  assert.equal(sfxCrossedStart(3.98, 4.01, start, 0, 3), true, "crosses the hit");
  assert.equal(
    sfxCrossedStart(4.05, 4.12, start, 0, 3),
    false,
    "must not re-fire while still inside the sample"
  );
  assert.equal(
    sfxCrossedStart(4.05, 8.0, start, 0, 3),
    false,
    "clip-change spike past the end must not fire"
  );
}

// Clip-pinned at offset 0
{
  const start = resolveSfxStartAt({ clipId: "c1", offsetInClip: 0, startAt: 99 }, offsets);
  assert.equal(start, 0);
  assert.equal(sfxShouldCatchup(0, start, 0, 1), true);
}

// Finished-before mark for resetSfxFiring
function isFullyFinished(fromAbs, start, trimStart, trimEnd) {
  const dur = sfxTrimDuration(trimStart, trimEnd);
  return start + dur <= fromAbs + 0.02;
}
assert.equal(isFullyFinished(0, 0, 0, 1.5), false, "0s hit must not be pre-marked fired at t=0");
assert.equal(isFullyFinished(2, 0, 0, 1.5), true);

console.log("sfx fire window tests passed");
