import assert from "node:assert/strict";

function stickerPlayDuration(sticker) {
  const speed = Math.max(0.25, Math.min(3, sticker.speed || 1));
  const dur = Number.isFinite(sticker.duration) && sticker.duration > 0 ? sticker.duration : 3;
  return Math.max(0.2, dur / speed);
}

function stickerPlacementInClip(sticker, clipStart, clipDuration) {
  if (!sticker.enabled) return null;
  const absStart = Math.max(0, Number.isFinite(sticker.startAt) ? sticker.startAt : 20);
  const playDur = stickerPlayDuration(sticker);
  const absEnd = absStart + playDur;
  const clipEnd = clipStart + clipDuration;
  if (absEnd <= clipStart + 0.01 || absStart >= clipEnd - 0.01) return null;

  const speed = Math.max(0.25, Math.min(3, sticker.speed || 1));
  const delay = Math.max(0, absStart - clipStart);
  const end = Math.min(clipDuration, absEnd - clipStart);
  const sourceSeek =
    clipStart > absStart ? Math.max(0, (clipStart - absStart) * speed) : 0;
  return { delay, end, sourceSeek };
}

const base = { enabled: true, startAt: 20, duration: 2, speed: 1 };

// Default 20s — early clips must not show it
assert.equal(stickerPlacementInClip(base, 0, 4), null);
assert.equal(stickerPlacementInClip(base, 12, 4), null);

// Clip covering 18–22 should show with 2s delay
{
  const p = stickerPlacementInClip(base, 18, 4);
  assert.ok(p);
  assert.equal(p.delay, 2);
  assert.equal(p.end, 4);
  assert.equal(p.sourceSeek, 0);
}

// Clip starting mid-sticker seeks into source
{
  const p = stickerPlacementInClip(base, 21, 4);
  assert.ok(p);
  assert.equal(p.delay, 0);
  assert.equal(p.sourceSeek, 1);
}

// Faster speed shortens visible window
assert.equal(stickerPlayDuration({ duration: 2, speed: 2 }), 1);

console.log("sticker timing tests passed");
