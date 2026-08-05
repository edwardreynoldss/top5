import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

function coverContainFactor(frameAspect, videoAspect) {
  return Math.max(frameAspect / videoAspect, videoAspect / frameAspect);
}

function cropEdgeBars(cropTop = 0, cropBottom = 0, cropLeft = 0, cropRight = 0) {
  const { top, bottom } = normalizeVerticalCrop(cropTop, cropBottom);
  const { left, right } = normalizeHorizontalCrop(cropLeft, cropRight);
  return { top, bottom, left, right };
}

/** Matches export route: only emit bars with even pixel size ≥ 2. */
function exportEdgeBlackBars(
  contentW,
  contentH,
  cropTop = 0,
  cropBottom = 0,
  cropLeft = 0,
  cropRight = 0
) {
  const { top, bottom } = normalizeVerticalCrop(cropTop, cropBottom);
  const { left, right } = normalizeHorizontalCrop(cropLeft, cropRight);
  const topBarPx = Math.floor((contentH * top) / 2) * 2;
  const botBarPx = Math.floor((contentH * bottom) / 2) * 2;
  const leftBarPx = Math.floor((contentW * left) / 2) * 2;
  const rightBarPx = Math.floor((contentW * right) / 2) * 2;
  const filters = [];
  if (topBarPx >= 2) {
    filters.push(`drawbox=x=0:y=0:w=iw:h=${topBarPx}:color=black:t=fill`);
  }
  if (botBarPx >= 2) {
    filters.push(`drawbox=x=0:y=ih-${botBarPx}:w=iw:h=${botBarPx}:color=black:t=fill`);
  }
  if (leftBarPx >= 2) {
    filters.push(`drawbox=x=0:y=0:w=${leftBarPx}:h=ih:color=black:t=fill`);
  }
  if (rightBarPx >= 2) {
    filters.push(`drawbox=x=iw-${rightBarPx}:y=0:w=${rightBarPx}:h=ih:color=black:t=fill`);
  }
  return filters.length ? `,${filters.join(",")}` : "";
}

// Defaults
{
  const z = normalizeVerticalCrop(0, 0);
  assert.equal(z.top, 0);
  assert.equal(z.bottom, 0);
  assert.equal(z.visibleH, 1);
  const h = normalizeHorizontalCrop(0, 0);
  assert.equal(h.left, 0);
  assert.equal(h.right, 0);
  assert.equal(h.visibleW, 1);
}

// Symmetric crop
{
  const z = normalizeVerticalCrop(0.1, 0.1);
  assert.ok(Math.abs(z.visibleH - 0.8) < 1e-9);
  const h = normalizeHorizontalCrop(0.1, 0.1);
  assert.ok(Math.abs(h.visibleW - 0.8) < 1e-9);
}

// Clamp single edge
{
  const z = normalizeVerticalCrop(0.9, 0);
  assert.equal(z.top, MAX_EDGE_CROP);
  assert.ok(z.visibleH >= MIN_VISIBLE_HEIGHT);
  const h = normalizeHorizontalCrop(0.9, 0);
  assert.equal(h.left, MAX_EDGE_CROP);
  assert.ok(h.visibleW >= MIN_VISIBLE_WIDTH);
}

// Rebalance when sum too large
{
  const z = normalizeVerticalCrop(0.45, 0.45);
  assert.ok(Math.abs(z.top + z.bottom - (1 - MIN_VISIBLE_HEIGHT)) < 1e-9);
  const h = normalizeHorizontalCrop(0.45, 0.45);
  assert.ok(Math.abs(h.left + h.right - (1 - MIN_VISIBLE_WIDTH)) < 1e-9);
}

// Edge crop must NOT change cover scale (black bars, not punch-zoom)
{
  const landscape = 16 / 9;
  const frame = 9 / 16;
  const cover0 = coverContainFactor(frame, landscape);
  const bars = cropEdgeBars(0.1, 0.1, 0.05, 0.05);
  assert.equal(bars.top, 0.1);
  assert.equal(bars.left, 0.05);
  const cover1 = coverContainFactor(frame, landscape);
  assert.equal(cover1, cover0, "edge crop must not increase cover scale");
}

// Bottom-only / left-only must not emit a zero-size opposite drawbox
{
  const bottomOnly = exportEdgeBlackBars(1080, 1920, 0, 0.08, 0, 0);
  assert.ok(!bottomOnly.includes("y=0:w=iw"), "bottom-only must not paint a top bar");
  assert.match(bottomOnly, /drawbox=x=0:y=ih-152:w=iw:h=152:color=black:t=fill/);

  const leftOnly = exportEdgeBlackBars(1080, 1920, 0, 0, 0.1, 0);
  assert.ok(!leftOnly.includes("x=iw-"), "left-only must not paint a right bar");
  assert.match(leftOnly, /drawbox=x=0:y=0:w=108:h=ih:color=black:t=fill/);

  const rightOnly = exportEdgeBlackBars(1080, 1920, 0, 0, 0, 0.1);
  assert.ok(!/,drawbox=x=0:y=0:w=\d+:h=ih/.test(rightOnly), "right-only must not paint a left bar");
  assert.match(rightOnly, /drawbox=x=iw-108:y=0:w=108:h=ih:color=black:t=fill/);

  const tiny = exportEdgeBlackBars(1080, 1920, 0.0004, 0, 0.0004, 0);
  assert.equal(tiny, "", "sub-pixel crop must emit no drawbox");
}

function frameMean(rawPath) {
  const d = fs.readFileSync(rawPath);
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i];
  return sum / d.length;
}

function renderFramed(outRaw, edgeBarsExpr) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=0.3",
      "-filter_complex",
      `[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,scale=iw*1:ih*1[czfg];` +
        `color=c=black:s=1080x1920:r=30:d=0.3[czbg];` +
        `[czbg][czfg]overlay=x='(W-w)*0.5':y='(H-h)*0.5':shortest=1,setsar=1${edgeBarsExpr},format=rgb24[vout]`,
      "-map",
      "[vout]",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      outRaw,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, (r.stderr || "").slice(-500));
}

const outDir = path.resolve("tmp/edge-crop-test");
fs.mkdirSync(outDir, { recursive: true });

// Legacy bug: zero-height top fill blanks the whole frame
{
  const bugRaw = path.join(outDir, "bug.raw");
  const legacy =
    `,drawbox=x=0:y=0:w=iw:h=floor(ih*0/2)*2:color=black:t=fill` +
    `,drawbox=x=0:y=ih-floor(ih*0.08/2)*2:w=iw:h=floor(ih*0.08/2)*2:color=black:t=fill`;
  renderFramed(bugRaw, legacy);
  const mean = frameMean(bugRaw);
  assert.ok(mean < 2, `legacy bottom-only crop should blank (mean=${mean})`);
}

// Fixed paths stay visible
{
  for (const [label, expr] of [
    ["bottom", exportEdgeBlackBars(1080, 1920, 0, 0.08, 0, 0)],
    ["top", exportEdgeBlackBars(1080, 1920, 0.1, 0, 0, 0)],
    ["left", exportEdgeBlackBars(1080, 1920, 0, 0, 0.1, 0)],
    ["right", exportEdgeBlackBars(1080, 1920, 0, 0, 0, 0.1)],
    ["all", exportEdgeBlackBars(1080, 1920, 0.06, 0.06, 0.06, 0.06)],
  ]) {
    const raw = path.join(outDir, `${label}.raw`);
    renderFramed(raw, expr);
    const mean = frameMean(raw);
    assert.ok(mean > 20, `${label} must not blank (mean=${mean})`);
  }
}

console.log("edge crop tests passed");
