import assert from "node:assert/strict";

const MAX_EDGE_CROP = 0.45;
const MIN_VISIBLE_HEIGHT = 0.2;
const MIN_VISIBLE_WIDTH = 0.2;

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

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
  return { top, bottom };
}

function normalizeHorizontalCrop(cropLeft = 0, cropRight = 0) {
  let left = clampCropEdge(cropLeft);
  let right = clampCropEdge(cropRight);
  const maxSum = 1 - MIN_VISIBLE_WIDTH;
  if (left + right > maxSum) {
    const scale = maxSum / (left + right);
    left *= scale;
    right *= scale;
  }
  return { left, right };
}

function normalizeCrop(crop = {}) {
  const v = normalizeVerticalCrop(crop.cropTop ?? 0, crop.cropBottom ?? 0);
  const h = normalizeHorizontalCrop(crop.cropLeft ?? 0, crop.cropRight ?? 0);
  return {
    zoom: clampCropZoom(crop.zoom ?? 1),
    panX: Math.max(0, Math.min(100, crop.panX ?? 50)),
    panY: Math.max(0, Math.min(100, crop.panY ?? 50)),
    cropTop: v.top,
    cropBottom: v.bottom,
    cropLeft: h.left,
    cropRight: h.right,
  };
}

function cropEdgeFromWindowPoint(edge, nx, ny, current) {
  const base = normalizeCrop(current);
  const x = Math.max(0, Math.min(1, Number.isFinite(nx) ? nx : 0));
  const y = Math.max(0, Math.min(1, Number.isFinite(ny) ? ny : 0));
  if (edge === "left") {
    const maxLeft = Math.max(0, 1 - MIN_VISIBLE_WIDTH - base.cropRight);
    return normalizeCrop({
      ...base,
      cropLeft: Math.max(0, Math.min(MAX_EDGE_CROP, maxLeft, x)),
    });
  }
  if (edge === "right") {
    const maxRight = Math.max(0, 1 - MIN_VISIBLE_WIDTH - base.cropLeft);
    return normalizeCrop({
      ...base,
      cropRight: Math.max(0, Math.min(MAX_EDGE_CROP, maxRight, 1 - x)),
    });
  }
  if (edge === "top") {
    const maxTop = Math.max(0, 1 - MIN_VISIBLE_HEIGHT - base.cropBottom);
    return normalizeCrop({
      ...base,
      cropTop: Math.max(0, Math.min(MAX_EDGE_CROP, maxTop, y)),
    });
  }
  const maxBottom = Math.max(0, 1 - MIN_VISIBLE_HEIGHT - base.cropTop);
  return normalizeCrop({
    ...base,
    cropBottom: Math.max(0, Math.min(MAX_EDGE_CROP, maxBottom, 1 - y)),
  });
}

/** Window placement — pan/zoom move the window; edge math is window-local. */
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

// Drag left edge to 20% of window
{
  const next = cropEdgeFromWindowPoint("left", 0.2, 0.5, {
    zoom: 1,
    panX: 50,
    panY: 50,
  });
  assert.ok(Math.abs(next.cropLeft - 0.2) < 1e-6);
  assert.equal(next.cropRight, 0);
  assert.equal(next.panX, 50);
  assert.equal(next.zoom, 1);
}

// Drag right edge: pointer at 80% → cropRight 20%
{
  const next = cropEdgeFromWindowPoint("right", 0.8, 0.5, { zoom: 1.5, panX: 30, panY: 70 });
  assert.ok(Math.abs(next.cropRight - 0.2) < 1e-6);
  assert.equal(next.cropLeft, 0);
  // Placement untouched
  assert.equal(next.panX, 30);
  assert.equal(next.panY, 70);
  assert.equal(next.zoom, 1.5);
}

// Top / bottom
{
  const top = cropEdgeFromWindowPoint("top", 0.5, 0.15, {});
  assert.ok(Math.abs(top.cropTop - 0.15) < 1e-6);
  const bottom = cropEdgeFromWindowPoint("bottom", 0.5, 0.85, top);
  assert.ok(Math.abs(bottom.cropBottom - 0.15) < 1e-6);
  assert.ok(Math.abs(bottom.cropTop - 0.15) < 1e-6);
}

// Clamp to MAX_EDGE and keep min visible against opposite edge
{
  const withRight = normalizeCrop({ cropRight: 0.4 });
  const left = cropEdgeFromWindowPoint("left", 0.9, 0.5, withRight);
  assert.ok(left.cropLeft + left.cropRight <= 0.8 + 1e-6);
  assert.ok(left.cropLeft <= MAX_EDGE_CROP + 1e-6);
}

// Pan then edge-drag: window moves, but same window-local nx yields same crop
{
  const centered = { zoom: 1, panX: 50, panY: 50, cropLeft: 0, cropRight: 0 };
  const panned = { zoom: 1.4, panX: 20, panY: 80, cropLeft: 0, cropRight: 0 };
  const a = cropEdgeFromWindowPoint("left", 0.25, 0.4, centered);
  const b = cropEdgeFromWindowPoint("left", 0.25, 0.4, panned);
  assert.ok(Math.abs(a.cropLeft - b.cropLeft) < 1e-6);
  assert.equal(b.panX, 20);
  assert.equal(b.panY, 80);
  assert.equal(b.zoom, 1.4);
}

// Handle positions track content edges; pan only moves the outer window
{
  const crop = normalizeCrop({
    zoom: 1.2,
    panX: 70,
    panY: 30,
    cropLeft: 0.1,
    cropRight: 0.2,
    cropTop: 0.05,
    cropBottom: 0.15,
  });
  const win = windowPlacement(crop);
  const handleLeftInWindow = crop.cropLeft * 100;
  const handleRightInWindow = (1 - crop.cropRight) * 100;
  assert.ok(Math.abs(handleLeftInWindow - 10) < 1e-6);
  assert.ok(Math.abs(handleRightInWindow - 80) < 1e-6);
  // After further pan, window moves but handle % inside window stays tied to crop edges
  const moved = windowPlacement({ ...crop, panX: 10, panY: 90 });
  assert.notEqual(moved.left, win.left);
  assert.notEqual(moved.top, win.top);
  assert.equal(crop.cropLeft, 0.1);
  assert.equal(crop.cropRight, 0.2);
}

console.log("edge crop drag tests passed");
