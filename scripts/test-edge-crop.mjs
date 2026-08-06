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

/** Export: crop edges then pad back so aspect (and sticker framing) stay stable. */
function exportEdgeCropFilter(cropTop = 0, cropBottom = 0, cropLeft = 0, cropRight = 0) {
  const { top, bottom, visibleH } = normalizeVerticalCrop(cropTop, cropBottom);
  const { left, right, visibleW } = normalizeHorizontalCrop(cropLeft, cropRight);
  const needs = top > 0.001 || bottom > 0.001 || left > 0.001 || right > 0.001;
  if (!needs) return "";
  const padXRatio = left / visibleW;
  const padYRatio = top / visibleH;
  return (
    `crop=floor(iw*${visibleW}/2)*2:floor(ih*${visibleH}/2)*2:floor(iw*${left}/2)*2:floor(ih*${top}/2)*2,` +
    `pad=ceil(iw/${visibleW}/2)*2:ceil(ih/${visibleH}/2)*2:` +
    `floor(iw*${padXRatio}/2)*2:floor(ih*${padYRatio}/2)*2:black,`
  );
}

{
  const f = exportEdgeCropFilter(0.1, 0, 0, 0);
  assert.ok(f.includes("crop="), "must crop source pixels");
  assert.ok(f.includes("pad="), "must pad back to original aspect for sticker safety");
  assert.ok(!f.includes("drawbox"), "must not use frame-fixed drawbox");
  assert.equal(exportEdgeCropFilter(0, 0, 0, 0), "");
}

{
  const edge = exportEdgeCropFilter(0.15, 0, 0, 0);
  const chain = `fps=30,${edge}scale=1080:1920:force_original_aspect_ratio=decrease`;
  assert.ok(chain.indexOf("crop=") < chain.indexOf("pad="));
  assert.ok(chain.indexOf("pad=") < chain.indexOf("scale="));
}

console.log("edge crop-then-pan (pad-back) tests passed");
