import assert from "node:assert/strict";

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

function normalizeVerticalCrop(cropTop = 0, cropBottom = 0) {
  let top = Math.max(0, Math.min(0.45, cropTop));
  let bottom = Math.max(0, Math.min(0.45, cropBottom));
  const maxSum = 0.8;
  if (top + bottom > maxSum) {
    const s = maxSum / (top + bottom);
    top *= s;
    bottom *= s;
  }
  return { top, bottom };
}

function normalizeHorizontalCrop(cropLeft = 0, cropRight = 0) {
  let left = Math.max(0, Math.min(0.45, cropLeft));
  let right = Math.max(0, Math.min(0.45, cropRight));
  const maxSum = 0.8;
  if (left + right > maxSum) {
    const s = maxSum / (left + right);
    left *= s;
    right *= s;
  }
  return { left, right };
}

/** Window + full-bleed video + pad-back shades (no nested % video box). */
function cropBox(crop, frameAspect, videoAspect) {
  const z = clampCropZoom(crop.zoom ?? 1);
  const { top: ct, bottom: cb } = normalizeVerticalCrop(crop.cropTop ?? 0, crop.cropBottom ?? 0);
  const { left: cl, right: cr } = normalizeHorizontalCrop(
    crop.cropLeft ?? 0,
    crop.cropRight ?? 0
  );
  let baseW;
  let baseH;
  if (videoAspect >= frameAspect) {
    baseW = 100;
    baseH = (100 * frameAspect) / videoAspect;
  } else {
    baseH = 100;
    baseW = (100 * videoAspect) / frameAspect;
  }
  return {
    w: baseW * z,
    h: baseH * z,
    videoW: 100,
    videoH: 100,
    videoLeft: 0,
    videoTop: 0,
    shadeTop: ct * 100,
    shadeBottom: cb * 100,
    shadeLeft: cl * 100,
    shadeRight: cr * 100,
  };
}

const frame = 9 / 16;
const portrait = cropBox({ zoom: 1 }, frame, 9 / 16);
assert.ok(Math.abs(portrait.w - 100) < 1e-6 && Math.abs(portrait.h - 100) < 1e-6);
assert.equal(portrait.videoW, 100);
assert.equal(portrait.videoH, 100);

const topped = cropBox({ zoom: 1, cropTop: 0.2 }, frame, 9 / 16);
assert.ok(Math.abs(topped.shadeTop - 20) < 1e-6, "top crop becomes pad shade");
assert.ok(Math.abs(topped.w - portrait.w) < 1e-6, "edge crop must NOT reflow window width");
assert.ok(Math.abs(topped.h - portrait.h) < 1e-6, "edge crop must NOT reflow window height");
assert.equal(topped.videoW, 100, "video still fills window (visible)");
assert.equal(topped.videoTop, 0, "video stays pinned — subject does not jump");

// Pan must not change shade/video fill — only window placement elsewhere
const panned = cropBox({ zoom: 1.2, panX: 20, panY: 80, cropLeft: 0.1 }, frame, 9 / 16);
assert.ok(Math.abs(panned.shadeLeft - 10) < 1e-6);
assert.equal(panned.videoW, 100);

console.log("crop box framing tests passed");
