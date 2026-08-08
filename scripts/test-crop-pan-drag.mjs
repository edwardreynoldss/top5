import assert from "node:assert/strict";

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

function normalizeVerticalCrop(cropTop = 0, cropBottom = 0) {
  let top = Math.max(0, Math.min(0.45, cropTop));
  let bottom = Math.max(0, Math.min(0.45, cropBottom));
  if (top + bottom > 0.8) {
    const s = 0.8 / (top + bottom);
    top *= s;
    bottom *= s;
  }
  return { top, bottom };
}

function normalizeHorizontalCrop(cropLeft = 0, cropRight = 0) {
  let left = Math.max(0, Math.min(0.45, cropLeft));
  let right = Math.max(0, Math.min(0.45, cropRight));
  if (left + right > 0.8) {
    const s = 0.8 / (left + right);
    left *= s;
    right *= s;
  }
  return { left, right };
}

/** Same window placement as cropPreviewStyle (pan/zoom). */
function windowPlacement(crop, frameAspect = 9 / 16, videoAspect = 9 / 16) {
  const z = clampCropZoom(crop.zoom ?? 1);
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
  return {
    w,
    h,
    left: (100 - w) / 2 + (0.5 - panX) * roomX,
    top: (100 - h) / 2 + (0.5 - panY) * roomY,
  };
}

/** Drag math from TrimModal: pointer delta → pan (video follows finger). */
function applyDragPan(startPan, dxPct, dyPct) {
  return {
    panX: Math.max(0, Math.min(100, startPan.panX - dxPct)),
    panY: Math.max(0, Math.min(100, startPan.panY - dyPct)),
  };
}

const centered = windowPlacement({ zoom: 1, panX: 50, panY: 50 });
const leftFocus = windowPlacement({ zoom: 1.5, panX: 0, panY: 50 });
const rightFocus = windowPlacement({ zoom: 1.5, panX: 100, panY: 50 });
const midZoom = windowPlacement({ zoom: 1.5, panX: 50, panY: 50 });
assert.ok(leftFocus.left > midZoom.left, "focus left → window shifts right");
assert.ok(rightFocus.left < midZoom.left, "focus right → window shifts left");

const downFocus = windowPlacement({ zoom: 1, panX: 50, panY: 80 });
const upFocus = windowPlacement({ zoom: 1, panX: 50, panY: 20 });
assert.ok(downFocus.top < centered.top, "panY high moves window up");
assert.ok(upFocus.top > downFocus.top, "panY low sits below panY high");

// Drag down should decrease panY so content follows the finger downward
const afterDragDown = applyDragPan({ panX: 50, panY: 50 }, 0, 20);
assert.equal(afterDragDown.panY, 30);
const placeAfter = windowPlacement({ zoom: 1, ...afterDragDown });
const placeBefore = windowPlacement({ zoom: 1, panX: 50, panY: 50 });
assert.ok(placeAfter.top > placeBefore.top, "drag down → window moves down");

// Edge crop must not alter pan placement (glitch regression)
const { top: ct } = normalizeVerticalCrop(0.2, 0);
const { left: cl } = normalizeHorizontalCrop(0.1, 0);
assert.ok(ct === 0.2 && cl === 0.1);
const withCrop = windowPlacement({ zoom: 1.2, panX: 40, panY: 70, cropTop: 0.2, cropLeft: 0.1 });
const noCrop = windowPlacement({ zoom: 1.2, panX: 40, panY: 70 });
assert.equal(withCrop.left, noCrop.left);
assert.equal(withCrop.top, noCrop.top);
assert.equal(withCrop.w, noCrop.w);
assert.equal(withCrop.h, noCrop.h);

console.log("crop pan translate tests passed");
