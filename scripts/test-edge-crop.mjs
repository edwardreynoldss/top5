import assert from "node:assert/strict";

const MAX_EDGE_CROP = 0.45;
const MIN_VISIBLE_HEIGHT = 0.2;

function clampCropEdge(value) {
  return Math.max(0, Math.min(MAX_EDGE_CROP, Number.isFinite(value) ? value : 0));
}

function normalizeVerticalCrop(cropTop = 0, cropBottom = 0) {
  let top = clampCropEdge(cropTop);
  let bottom = clampCropEdge(cropBottom);
  const maxSum = 1 - MIN_VISIBLE_HEIGHT;
  if (top + bottom > maxSum) {
    const scale = maxSum / (top + bottom);
    top *= scale;
    bottom *= scale;
  }
  return { top, bottom, visibleH: Math.max(MIN_VISIBLE_HEIGHT, 1 - top - bottom) };
}

function coverContainFactor(frameAspect, videoAspect) {
  return Math.max(frameAspect / videoAspect, videoAspect / frameAspect);
}

function cropEffectiveAspect(videoAspect, cropTop, cropBottom) {
  const { visibleH } = normalizeVerticalCrop(cropTop, cropBottom);
  return videoAspect / visibleH;
}

// Defaults
{
  const z = normalizeVerticalCrop(0, 0);
  assert.equal(z.top, 0);
  assert.equal(z.bottom, 0);
  assert.equal(z.visibleH, 1);
}

// Symmetric crop
{
  const z = normalizeVerticalCrop(0.1, 0.1);
  assert.ok(Math.abs(z.visibleH - 0.8) < 1e-9);
  assert.equal(z.top, 0.1);
  assert.equal(z.bottom, 0.1);
}

// Clamp single edge
{
  const z = normalizeVerticalCrop(0.9, 0);
  assert.equal(z.top, MAX_EDGE_CROP);
  assert.ok(z.visibleH >= MIN_VISIBLE_HEIGHT);
}

// Rebalance when sum too large
{
  const z = normalizeVerticalCrop(0.45, 0.45);
  assert.ok(Math.abs(z.top + z.bottom - (1 - MIN_VISIBLE_HEIGHT)) < 1e-9);
  assert.ok(Math.abs(z.visibleH - MIN_VISIBLE_HEIGHT) < 1e-9);
}

// Effective aspect widens after vertical crop
{
  const landscape = 16 / 9;
  const effective = cropEffectiveAspect(landscape, 0.1, 0.1);
  assert.ok(Math.abs(effective - landscape / 0.8) < 1e-9);
  const frame = 9 / 16;
  const cover0 = coverContainFactor(frame, landscape);
  const cover1 = coverContainFactor(frame, effective);
  assert.ok(cover1 > cover0, "edge crop must increase cover scale (punch into kept band)");
  assert.ok(Math.abs(cover1 / cover0 - 1 / 0.8) < 1e-6);
}

// Export-style ffmpeg crop expression stays even-friendly
{
  const cropTop = 0.12;
  const cropBottom = 0.08;
  const { visibleH, top } = normalizeVerticalCrop(cropTop, cropBottom);
  const expr = `crop=iw:floor(ih*${visibleH}/2)*2:0:floor(ih*${top}/2)*2`;
  assert.match(expr, /^crop=iw:floor\(ih\*0\.8\/2\)\*2:0:floor\(ih\*0\.12\/2\)\*2$/);
}

console.log("edge crop tests passed");
