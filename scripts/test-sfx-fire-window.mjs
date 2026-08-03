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

/** Same catch window as PreviewPhone.playSfxPlacement */
function shouldFire(absNow, start, trimStart, trimEnd) {
  const dur = Math.max(0.05, trimEnd - trimStart);
  const end = start + dur;
  return !(absNow < start - 0.03 || absNow >= end - 0.02);
}

const offsets = [{ clipId: "c1", start: 0, duration: 5 }];

// Absolute placement at 0.00s
{
  const start = resolveSfxStartAt({ clipId: null, offsetInClip: 0, startAt: 0 }, offsets);
  assert.equal(start, 0);
  assert.equal(shouldFire(0, start, 0, 1.5), true, "must fire at exactly 0");
  assert.equal(shouldFire(0.3, start, 0, 1.5), true, "must still catch after 0.25s (old bug)");
  assert.equal(shouldFire(1.6, start, 0, 1.5), false, "must not fire after sample ends");
}

// Clip-pinned at offset 0
{
  const start = resolveSfxStartAt({ clipId: "c1", offsetInClip: 0, startAt: 99 }, offsets);
  assert.equal(start, 0);
  assert.equal(shouldFire(0, start, 0, 1), true);
}

// Finished-before mark for resetSfxFiring
function isFullyFinished(fromAbs, start, trimStart, trimEnd) {
  const dur = Math.max(0.05, trimEnd - trimStart);
  return start + dur <= fromAbs + 0.02;
}
assert.equal(isFullyFinished(0, 0, 0, 1.5), false, "0s hit must not be pre-marked fired at t=0");
assert.equal(isFullyFinished(2, 0, 0, 1.5), true);

console.log("sfx fire window tests passed");
