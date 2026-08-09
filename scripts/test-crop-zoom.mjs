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

/** Inset pad-back box + video sample (must stay non-zero). */
function cropBox(crop, frameAspect, videoAspect) {
  const z = clampCropZoom(crop.zoom ?? 1);
  const { top: ct, bottom: cb } = normalizeVerticalCrop(crop.cropTop ?? 0, crop.cropBottom ?? 0);
  const { left: cl, right: cr } = normalizeHorizontalCrop(
    crop.cropLeft ?? 0,
    crop.cropRight ?? 0
  );
  const visibleW = Math.max(0.2, 1 - cl - cr);
  const visibleH = Math.max(0.2, 1 - ct - cb);
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
    contentLeft: cl * 100,
    contentRight: cr * 100,
    contentTop: ct * 100,
    contentBottom: cb * 100,
    // content box size as % of window
    contentW: visibleW * 100,
    contentH: visibleH * 100,
    videoW: 100 / visibleW,
    videoH: 100 / visibleH,
    videoLeft: (-cl / visibleW) * 100,
    videoTop: (-ct / visibleH) * 100,
  };
}

const frame = 9 / 16;
const portrait = cropBox({ zoom: 1 }, frame, 9 / 16);
assert.ok(Math.abs(portrait.w - 100) < 1e-6 && Math.abs(portrait.h - 100) < 1e-6);
assert.ok(Math.abs(portrait.contentW - 100) < 1e-6);
assert.ok(Math.abs(portrait.contentH - 100) < 1e-6);
assert.ok(Math.abs(portrait.videoW - 100) < 1e-6);
assert.ok(Math.abs(portrait.videoH - 100) < 1e-6);
assert.ok(portrait.contentW > 1 && portrait.contentH > 1, "content must be visible");

const topped = cropBox({ zoom: 1, cropTop: 0.2 }, frame, 9 / 16);
assert.ok(Math.abs(topped.contentTop - 20) < 1e-6, "top crop becomes pad inset");
assert.ok(Math.abs(topped.contentH - 80) < 1e-6, "remaining content height");
assert.ok(Math.abs(topped.w - portrait.w) < 1e-6, "edge crop must NOT reflow window width");
assert.ok(Math.abs(topped.h - portrait.h) < 1e-6, "edge crop must NOT reflow window height");
assert.ok(topped.videoH > 100, "video taller than content to sample crop");
assert.ok(Math.abs(topped.videoTop + 25) < 1e-6, "video shifted up into crop");

// Nested size relative to window: video covers full window even with crop
const videoVsWindowH = (topped.videoH / 100) * (topped.contentH / 100) * 100;
assert.ok(Math.abs(videoVsWindowH - 100) < 1e-6, "video spans full window height");

const panned = cropBox({ zoom: 1.2, panX: 20, panY: 80, cropLeft: 0.1 }, frame, 9 / 16);
assert.ok(Math.abs(panned.contentLeft - 10) < 1e-6);
assert.ok(panned.contentW > 1 && panned.videoW > 100);

console.log("crop box framing tests passed");
