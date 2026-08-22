import assert from "node:assert/strict";

const clampUnit = (n, fallback = 1) =>
  Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback));

/** Mirrors clipShortText / clipInDepthText / rankDisplayText in defaults.ts */
function clipInDepthText(clip) {
  return (clip.inDepthText || "").trim() || (clip.label || "").trim();
}
function formatClipScore(raw) {
  const score = (raw || "").trim();
  if (!score || /^\/\s*\d+(?:[.,]\d+)?$/.test(score)) return "";
  if (/^\d+(?:[.,]\d+)?$/.test(score)) return `${score}/10`;
  const outOf = score.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  return outOf ? `${outOf[1]}/${outOf[2]}` : score;
}
function clipShortText(clip) {
  const name = (clip.label || "").trim();
  const score = formatClipScore(clip.score);
  if (name && score) return `${name} - ${score}`;
  return name || score;
}
function rankDisplayText(clip, { inDepth, isActive }) {
  if (!inDepth) return (clip.label || "").trim();
  return isActive ? clipInDepthText(clip) : clipShortText(clip);
}
function inDepthLabelOpacity(progress, activeOpacity, fadeTo) {
  const p = clampUnit(progress, 0);
  const from = clampUnit(activeOpacity, 1);
  const to = clampUnit(fadeTo, 0.45);
  return from + (to - from) * p;
}

const cat = {
  label: "Cat Running",
  inDepthText: "This Cat does NOT care 😂",
  score: "8.11",
};

// --- the user's example: description while playing, name + ranking afterwards ---
{
  assert.equal(
    rankDisplayText(cat, { inDepth: true, isActive: true }),
    "This Cat does NOT care 😂"
  );
  assert.equal(
    rankDisplayText(cat, { inDepth: true, isActive: false }),
    "Cat Running - 8.11/10"
  );
}

// --- in-depth off keeps the plain label in both states ---
{
  assert.equal(rankDisplayText(cat, { inDepth: false, isActive: true }), "Cat Running");
  assert.equal(rankDisplayText(cat, { inDepth: false, isActive: false }), "Cat Running");
}

// --- missing pieces degrade instead of showing stray separators ---
{
  assert.equal(
    rankDisplayText({ label: "Just A Name" }, { inDepth: true, isActive: true }),
    "Just A Name",
    "no long line falls back to the label"
  );
  assert.equal(
    rankDisplayText({ label: "Just A Name" }, { inDepth: true, isActive: false }),
    "Just A Name",
    "no score means no trailing dash"
  );
  assert.equal(
    rankDisplayText({ label: "", score: "9.4" }, { inDepth: true, isActive: false }),
    "9.4/10"
  );
  assert.equal(rankDisplayText({}, { inDepth: true, isActive: true }), "");
}

// --- the playing line eases down across the clip, never below the floor ---
{
  const active = 1;
  const fadeTo = 0.45;
  assert.ok(Math.abs(inDepthLabelOpacity(0, active, fadeTo) - 1) < 1e-9);
  assert.ok(Math.abs(inDepthLabelOpacity(0.5, active, fadeTo) - 0.725) < 1e-9);
  assert.ok(Math.abs(inDepthLabelOpacity(1, active, fadeTo) - 0.45) < 1e-9);
  // monotonically decreasing
  let prev = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const v = inDepthLabelOpacity(p, active, fadeTo);
    assert.ok(v <= prev + 1e-9, `opacity must not rise at p=${p}`);
    prev = v;
  }
  // out-of-range progress is clamped
  assert.ok(Math.abs(inDepthLabelOpacity(-5, active, fadeTo) - 1) < 1e-9);
  assert.ok(Math.abs(inDepthLabelOpacity(9, active, fadeTo) - 0.45) < 1e-9);
}

/**
 * Export builds the same ramp from two layers: a base drawn at the floor and a
 * layer at `A` that ffmpeg fades to zero. Compositing must reproduce the lerp.
 */
function compositeOpacity(fadeFactor, floor, layerAlphaAtStart) {
  const layer = layerAlphaAtStart * fadeFactor;
  return layer + floor * (1 - layer);
}

{
  const active = 1;
  const floor = 0.45;
  const A = (active - floor) / (1 - floor);
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const composite = compositeOpacity(f, floor, A);
    // f is "time remaining", so progress through the clip is 1 - f
    const preview = inDepthLabelOpacity(1 - f, active, floor);
    assert.ok(
      Math.abs(composite - preview) < 1e-9,
      `f=${f} export=${composite} preview=${preview}`
    );
  }
}

// --- a partial active opacity still lands on both endpoints ---
{
  const active = 0.8;
  const floor = 0.3;
  const A = (active - floor) / (1 - floor);
  assert.ok(Math.abs(compositeOpacity(1, floor, A) - active) < 1e-9);
  assert.ok(Math.abs(compositeOpacity(0, floor, A) - floor) < 1e-9);
}

/**
 * A clip split by a hook gap renders as two pieces; each piece bakes its own
 * start alpha and a stretched fade so the ramp stays continuous.
 */
function pieceFade(offset, length, total) {
  const fStart = clampUnit(1 - offset / total, 0);
  const fEnd = clampUnit(1 - (offset + length) / total, 0);
  const ratio = fStart <= 0.005 ? 0 : fEnd / fStart;
  return {
    fStart,
    fEnd,
    duration: ratio >= 0.999 ? 0 : length / (1 - ratio),
  };
}

{
  const total = 10;
  const first = pieceFade(0, 4, total);
  const second = pieceFade(4, 6, total);
  // continuous across the split
  assert.ok(Math.abs(first.fEnd - second.fStart) < 1e-9, "no jump at the hook split");
  assert.ok(Math.abs(first.fStart - 1) < 1e-9);
  assert.ok(Math.abs(second.fEnd - 0) < 1e-9, "fully faded by the end of the clip");

  // the stretched fade reaches the intended factor at the end of each piece
  const factorAtEnd = (p, length) =>
    p.duration === 0 ? p.fStart : p.fStart * (1 - length / p.duration);
  assert.ok(Math.abs(factorAtEnd(first, 4) - first.fEnd) < 1e-9);
  assert.ok(Math.abs(factorAtEnd(second, 6) - second.fEnd) < 1e-9);
}

// --- single-piece clip is the simple full-length fade ---
{
  const p = pieceFade(0, 8, 8);
  assert.ok(Math.abs(p.duration - 8) < 1e-9);
}

console.log("in depth ranking tests passed");
