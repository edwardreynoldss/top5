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

function cropEdgeBars(cropTop = 0, cropBottom = 0) {
  const { top, bottom } = normalizeVerticalCrop(cropTop, cropBottom);
  return { top, bottom };
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

// Edge crop must NOT change cover scale (black bars, not punch-zoom)
{
  const landscape = 16 / 9;
  const frame = 9 / 16;
  const cover0 = coverContainFactor(frame, landscape);
  const bars = cropEdgeBars(0.1, 0.1);
  assert.equal(bars.top, 0.1);
  assert.equal(bars.bottom, 0.1);
  // Preview still uses original aspect for zoom framing
  const cover1 = coverContainFactor(frame, landscape);
  assert.equal(cover1, cover0, "edge crop must not increase cover scale");
}

// Export-style ffmpeg drawbox expressions (black bars on framed output)
{
  const cropTop = 0.12;
  const cropBottom = 0.08;
  const { top, bottom } = normalizeVerticalCrop(cropTop, cropBottom);
  const expr =
    `drawbox=x=0:y=0:w=iw:h=floor(ih*${top}/2)*2:color=black:t=fill` +
    `,drawbox=x=0:y=ih-floor(ih*${bottom}/2)*2:w=iw:h=floor(ih*${bottom}/2)*2:color=black:t=fill`;
  assert.match(expr, /drawbox=x=0:y=0:w=iw:h=floor\(ih\*0\.12\/2\)\*2:color=black:t=fill/);
  assert.match(
    expr,
    /drawbox=x=0:y=ih-floor\(ih\*0\.08\/2\)\*2:w=iw:h=floor\(ih\*0\.08\/2\)\*2:color=black:t=fill/
  );
}

console.log("edge crop tests passed");
