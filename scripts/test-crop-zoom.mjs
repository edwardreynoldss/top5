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

function cropBox(crop, frameAspect, videoAspect) {
  const z = clampCropZoom(crop.zoom ?? 1);
  const { top: ct, bottom: cb } = normalizeVerticalCrop(crop.cropTop ?? 0, crop.cropBottom ?? 0);
  const { left: cl, right: cr } = normalizeHorizontalCrop(
    crop.cropLeft ?? 0,
    crop.cropRight ?? 0
  );
  const visibleW = Math.max(0.2, 1 - cl - cr);
  const visibleH = Math.max(0.2, 1 - ct - cb);
  const croppedAspect = (videoAspect * visibleW) / visibleH;
  let baseW;
  let baseH;
  if (croppedAspect >= frameAspect) {
    baseW = 100;
    baseH = (100 * frameAspect) / croppedAspect;
  } else {
    baseH = 100;
    baseW = (100 * croppedAspect) / frameAspect;
  }
  return {
    w: baseW * z,
    h: baseH * z,
    videoW: 100 / visibleW,
    videoH: 100 / visibleH,
    videoLeft: (-cl / visibleW) * 100,
    videoTop: (-ct / visibleH) * 100,
  };
}

const frame = 9 / 16;

const fit = cropBox({ zoom: 1 }, frame, 16 / 9);
assert.ok(Math.abs(fit.w - 100) < 1e-6);
assert.ok(fit.h < 100);

const portrait = cropBox({ zoom: 1 }, frame, 9 / 16);
assert.ok(Math.abs(portrait.w - 100) < 1e-6 && Math.abs(portrait.h - 100) < 1e-6);

// Top crop insets the video upward inside the window
const topped = cropBox({ zoom: 1, cropTop: 0.2 }, frame, 9 / 16);
assert.ok(topped.videoTop < -0.01, "top crop shifts video up inside the window");
assert.ok(topped.videoH > 100, "inner video taller than window so bottom is cut");
assert.ok(topped.w > portrait.w || topped.h < portrait.h, "cropped aspect reflows the window");

console.log("crop box 1:1 framing tests passed");
