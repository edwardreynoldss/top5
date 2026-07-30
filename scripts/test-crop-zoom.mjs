import assert from "node:assert/strict";

function coverContainFactor(frameAspect, videoAspect) {
  if (
    !Number.isFinite(frameAspect) ||
    !Number.isFinite(videoAspect) ||
    frameAspect <= 0 ||
    videoAspect <= 0
  ) {
    return 1;
  }
  return Math.max(frameAspect / videoAspect, videoAspect / frameAspect);
}

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(3, Number.isFinite(zoom) ? zoom : 1));
}

function cropDisplayScale(zoom, frameAspect, videoAspect) {
  const z = clampCropZoom(zoom);
  const cover = coverContainFactor(frameAspect, videoAspect);
  return cover * z;
}

const frame = 9 / 16;
const landscape = 16 / 9;
const cover = coverContainFactor(frame, landscape);

assert.ok(cover > 3 && cover < 3.3, `expected ~3.16 cover factor, got ${cover}`);

const at1 = cropDisplayScale(1, frame, landscape);
const at095 = cropDisplayScale(0.95, frame, landscape);
const atFit = cropDisplayScale(1 / cover, frame, landscape);

assert.ok(Math.abs(at1 - cover) < 1e-9);
assert.ok(at095 < at1, "0.95x must be slightly smaller than 1x, not a cliff");
assert.ok(at095 / at1 > 0.9, "0.95x must stay near fill size (no tiny contain jump)");
assert.ok(Math.abs(atFit - 1) < 1e-6, "zoom at 1/coverFactor must equal contain size");

const portrait = cropDisplayScale(0.95, frame, 9 / 16);
assert.ok(Math.abs(portrait - 0.95) < 1e-9, "matching aspect: scale === zoom");

console.log("crop zoom continuous tests passed");
