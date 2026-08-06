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
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

/** zoom=1 is full-frame contain; scale === zoom */
function cropDisplayScale(zoom, _frameAspect, _videoAspect) {
  return clampCropZoom(zoom);
}

const frame = 9 / 16;
const landscape = 16 / 9;
const cover = coverContainFactor(frame, landscape);

assert.ok(cover > 3 && cover < 3.3, `expected ~3.16 cover factor, got ${cover}`);

const at1 = cropDisplayScale(1, frame, landscape);
const at095 = cropDisplayScale(0.95, frame, landscape);
const atFill = cropDisplayScale(cover, frame, landscape);

assert.equal(at1, 1, "zoom 1 must be full-frame contain (keep baked bars)");
assert.ok(at095 < at1, "0.95x must be slightly smaller than 1x");
assert.ok(Math.abs(atFill - cover) < 1e-9, "zoom at coverFactor fills the Shorts frame");

const portrait = cropDisplayScale(0.95, frame, 9 / 16);
assert.ok(Math.abs(portrait - 0.95) < 1e-9, "matching aspect: scale === zoom");

console.log("crop zoom contain-at-1 tests passed");
