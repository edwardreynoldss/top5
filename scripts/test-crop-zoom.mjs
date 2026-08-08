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

/**
 * Mirrors cropPreviewStyle: window from full aspect × zoom × pan;
 * content box is pad-back inset; video samples cropped region inside it.
 */
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
  const w = baseW * z;
  const h = baseH * z;
  const panX = (crop.panX ?? 50) / 100;
  const panY = (crop.panY ?? 50) / 100;
  const roomX = Math.max(w - 100, 100 * 0.45);
  const roomY = Math.max(h - 100, 100 * 0.45);
  const left = (100 - w) / 2 + (0.5 - panX) * roomX;
  const top = (100 - h) / 2 + (0.5 - panY) * roomY;
  return {
    w,
    h,
    left,
    top,
    contentLeft: cl * 100,
    contentTop: ct * 100,
    contentW: visibleW * 100,
    contentH: visibleH * 100,
    videoW: 100 / visibleW,
    videoH: 100 / visibleH,
    videoLeft: (-cl / visibleW) * 100,
    videoTop: (-ct / visibleH) * 100,
  };
}

/** Source Y (0–1) mapped into window % under pad-back layout. */
function sourceYInWindow(sourceY, box) {
  const videoTopWin = box.contentTop + (box.videoTop / 100) * box.contentH;
  const videoHeightWin = (box.videoH / 100) * box.contentH;
  return videoTopWin + sourceY * videoHeightWin;
}

const frame = 9 / 16;
const portrait = cropBox({ zoom: 1, panX: 50, panY: 50 }, frame, 9 / 16);
assert.ok(Math.abs(portrait.w - 100) < 1e-6 && Math.abs(portrait.h - 100) < 1e-6);
assert.ok(Math.abs(portrait.contentW - 100) < 1e-6);
assert.ok(Math.abs(portrait.contentH - 100) < 1e-6);

const topped = cropBox({ zoom: 1, panX: 50, panY: 50, cropTop: 0.2 }, frame, 9 / 16);
assert.ok(topped.videoTop < -0.01, "top crop insets video inside content box");
assert.ok(Math.abs(topped.w - portrait.w) < 1e-6, "edge crop must NOT reflow window width");
assert.ok(Math.abs(topped.h - portrait.h) < 1e-6, "edge crop must NOT reflow window height");
assert.ok(Math.abs(topped.contentTop - 20) < 1e-6, "pad-back content starts below cropped top");
assert.ok(Math.abs(topped.contentH - 80) < 1e-6, "pad-back content height is visible band");

// Subject mid-point must stay put when edge-cropping (the pan-then-crop glitch)
const midBefore = sourceYInWindow(0.5, portrait);
const midAfter = sourceYInWindow(0.5, topped);
assert.ok(
  Math.abs(midBefore - midAfter) < 1e-6,
  `edge crop must not rescale/jump subject (before=${midBefore}, after=${midAfter})`
);

// Pan down, then crop — window moves with pan; subject still stable within window
const panned = cropBox({ zoom: 1, panX: 50, panY: 75, cropTop: 0 }, frame, 9 / 16);
const pannedCrop = cropBox({ zoom: 1, panX: 50, panY: 75, cropTop: 0.15 }, frame, 9 / 16);
assert.ok(panned.top < portrait.top, "panY>50 moves window up in stage coords");
assert.ok(Math.abs(panned.top - pannedCrop.top) < 1e-6, "edge crop must not move panned window");
assert.ok(
  Math.abs(sourceYInWindow(0.5, panned) - sourceYInWindow(0.5, pannedCrop)) < 1e-6,
  "pan then crop must keep subject stable inside the window"
);

// Horizontal pad-back
const sided = cropBox({ zoom: 1, panX: 50, panY: 50, cropLeft: 0.1, cropRight: 0.1 }, frame, 9 / 16);
assert.ok(Math.abs(sided.contentLeft - 10) < 1e-6);
assert.ok(Math.abs(sided.contentW - 80) < 1e-6);
assert.ok(Math.abs(sided.w - 100) < 1e-6);

console.log("crop box framing tests passed");
