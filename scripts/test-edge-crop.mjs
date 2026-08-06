import assert from "node:assert/strict";

const MAX_EDGE_CROP = 0.45;
const MIN_VISIBLE_HEIGHT = 0.2;
const MIN_VISIBLE_WIDTH = 0.2;

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

function normalizeHorizontalCrop(cropLeft = 0, cropRight = 0) {
  let left = clampCropEdge(cropLeft);
  let right = clampCropEdge(cropRight);
  const maxSum = 1 - MIN_VISIBLE_WIDTH;
  if (left + right > maxSum) {
    const scale = maxSum / (left + right);
    left *= scale;
    right *= scale;
  }
  return { left, right, visibleW: Math.max(MIN_VISIBLE_WIDTH, 1 - left - right) };
}

function cropEffectiveAspect(videoAspect, crop = {}) {
  const { top, bottom } = normalizeVerticalCrop(crop.cropTop ?? 0, crop.cropBottom ?? 0);
  const { left, right } = normalizeHorizontalCrop(crop.cropLeft ?? 0, crop.cropRight ?? 0);
  const visibleW = Math.max(0.2, 1 - left - right);
  const visibleH = Math.max(0.2, 1 - top - bottom);
  return (videoAspect * visibleW) / visibleH;
}

/** Export filter: crop source BEFORE contain/zoom/pan (no drawbox masks). */
function exportEdgeCropFilter(cropTop = 0, cropBottom = 0, cropLeft = 0, cropRight = 0) {
  const { top, bottom, visibleH } = normalizeVerticalCrop(cropTop, cropBottom);
  const { left, right, visibleW } = normalizeHorizontalCrop(cropLeft, cropRight);
  const needs =
    top > 0.001 || bottom > 0.001 || left > 0.001 || right > 0.001;
  if (!needs) return "";
  return `crop=floor(iw*${visibleW}/2)*2:floor(ih*${visibleH}/2)*2:floor(iw*${left}/2)*2:floor(ih*${top}/2)*2,`;
}

// Defaults
{
  const a = cropEffectiveAspect(16 / 9, {});
  assert.ok(Math.abs(a - 16 / 9) < 1e-9);
}

// Top crop changes aspect (taller kept band relative to width → narrower aspect)
{
  const full = 16 / 9;
  const cropped = cropEffectiveAspect(full, { cropTop: 0.2 });
  assert.ok(cropped > full, "cutting top should make remaining aspect wider? wait");
}
// visibleH = 0.8, visibleW = 1 → Ac = Av * 1/0.8 = Av * 1.25 → WIDER (more landscape)
{
  const full = 9 / 16;
  const cropped = cropEffectiveAspect(full, { cropTop: 0.2 });
  assert.ok(cropped > full, "top crop on portrait → wider effective aspect");
}

// Export uses crop= not drawbox
{
  const f = exportEdgeCropFilter(0.1, 0, 0, 0);
  assert.ok(f.startsWith("crop="), "must crop source pixels");
  assert.ok(!f.includes("drawbox"), "must not paint frame-fixed bars");
  assert.equal(exportEdgeCropFilter(0, 0, 0, 0), "");
}

// Filter order: crop before scale
{
  const edge = exportEdgeCropFilter(0.15, 0, 0, 0);
  const chain =
    `fps=30,` +
    edge +
    `scale=1080:1920:force_original_aspect_ratio=decrease,` +
    `scale=iw*1:ih*1`;
  const cropAt = chain.indexOf("crop=");
  const scaleAt = chain.indexOf("scale=");
  assert.ok(cropAt >= 0 && scaleAt > cropAt, "source crop must run before scale");
}

console.log("edge crop-then-pan tests passed");
