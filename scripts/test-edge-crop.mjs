import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

/** Matches export route: only emit bars with even pixel height ≥ 2. */
function exportEdgeBlackBars(contentH, cropTop = 0, cropBottom = 0) {
  const { top, bottom } = normalizeVerticalCrop(cropTop, cropBottom);
  const topBarPx = Math.floor((contentH * top) / 2) * 2;
  const botBarPx = Math.floor((contentH * bottom) / 2) * 2;
  const filters = [];
  if (topBarPx >= 2) {
    filters.push(`drawbox=x=0:y=0:w=iw:h=${topBarPx}:color=black:t=fill`);
  }
  if (botBarPx >= 2) {
    filters.push(`drawbox=x=0:y=ih-${botBarPx}:w=iw:h=${botBarPx}:color=black:t=fill`);
  }
  return filters.length ? `,${filters.join(",")}` : "";
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
  const cover1 = coverContainFactor(frame, landscape);
  assert.equal(cover1, cover0, "edge crop must not increase cover scale");
}

// Bottom-only / top-only must not emit a zero-height drawbox
{
  const bottomOnly = exportEdgeBlackBars(1920, 0, 0.08);
  assert.ok(!bottomOnly.includes("y=0:"), "bottom-only must not paint a top bar");
  assert.match(bottomOnly, /drawbox=x=0:y=ih-152:w=iw:h=152:color=black:t=fill/);

  const topOnly = exportEdgeBlackBars(1920, 0.1, 0);
  assert.ok(!topOnly.includes("y=ih-"), "top-only must not paint a bottom bar");
  assert.match(topOnly, /drawbox=x=0:y=0:w=iw:h=192:color=black:t=fill/);

  const tiny = exportEdgeBlackBars(1920, 0.0004, 0);
  assert.equal(tiny, "", "sub-pixel crop must emit no drawbox (h would be 0)");
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

// Fixed path: bottom-only crop keeps picture visible
{
  const fixRaw = path.join(outDir, "fix.raw");
  renderFramed(fixRaw, exportEdgeBlackBars(1920, 0, 0.08));
  const mean = frameMean(fixRaw);
  assert.ok(mean > 20, `fixed bottom-only crop must not blank (mean=${mean})`);
}

// Top-only and both edges also stay visible
{
  for (const [top, bot, label] of [
    [0.1, 0, "top-only"],
    [0.08, 0.08, "both"],
  ]) {
    const raw = path.join(outDir, `${label}.raw`);
    renderFramed(raw, exportEdgeBlackBars(1920, top, bot));
    const mean = frameMean(raw);
    assert.ok(mean > 20, `${label} must not blank (mean=${mean})`);
  }
}

console.log("edge crop tests passed");
