import assert from "node:assert/strict";

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

function normalizeCrop(crop) {
  return {
    zoom: clampCropZoom(crop?.zoom ?? 1),
    panX: Math.max(0, Math.min(100, crop?.panX ?? 50)),
    panY: Math.max(0, Math.min(100, crop?.panY ?? 50)),
  };
}

/** Mirror of cropPreviewStyle box math */
function cropBox(crop, frameAspect, videoAspect) {
  const n = normalizeCrop(crop);
  const z = n.zoom;
  const va = videoAspect > 0 ? videoAspect : frameAspect;
  let baseW;
  let baseH;
  if (va >= frameAspect) {
    baseW = 100;
    baseH = (100 * frameAspect) / va;
  } else {
    baseH = 100;
    baseW = (100 * va) / frameAspect;
  }
  return { w: baseW * z, h: baseH * z };
}

const frame = 9 / 16;
const landscape = 16 / 9;

const fit = cropBox({ zoom: 1, panX: 50, panY: 50 }, frame, landscape);
assert.ok(Math.abs(fit.w - 100) < 1e-6, "16:9 at zoom 1 fills width");
assert.ok(fit.h < 100, "16:9 at zoom 1 letterboxes top/bottom (keeps side bars in pixels)");

const portrait = cropBox({ zoom: 1, panX: 50, panY: 50 }, frame, 9 / 16);
assert.ok(Math.abs(portrait.w - 100) < 1e-6);
assert.ok(Math.abs(portrait.h - 100) < 1e-6, "matching 9:16 fills the frame exactly");

const cover = Math.max(frame / landscape, landscape / frame);
const filled = cropBox({ zoom: cover, panX: 50, panY: 50 }, frame, landscape);
assert.ok(filled.w > 100 && Math.abs(filled.h - 100) < 1e-6, "cover zoom fills height");

console.log("crop box 1:1 framing tests passed");
