import assert from "node:assert/strict";

// Pure re-implementations of the animated-zoom helpers in src/lib/defaults.ts,
// kept in-file (like the other crop tests) so this runs with plain `node`.

const MIN_KEYFRAME_ZOOM = 1;
const MAX_KEYFRAME_ZOOM = 4;
const MAX_ZOOM_KEYFRAMES = 12;

function clampKeyframeZoom(z) {
  return Math.max(MIN_KEYFRAME_ZOOM, Math.min(MAX_KEYFRAME_ZOOM, Number.isFinite(z) ? z : 1));
}
function clampPan(v) {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 50));
}

function normalizeZoomKeyframes(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const points = raw
    .map((k, i) => {
      if (!k || typeof k !== "object") return null;
      const t = Math.max(0, Math.min(1, Number.isFinite(k.t) ? Number(k.t) : 0));
      return { id: k.id || `k${i}`, t, zoom: clampKeyframeZoom(Number(k.zoom)), panX: clampPan(Number(k.panX)), panY: clampPan(Number(k.panY)) };
    })
    .filter(Boolean);
  points.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) points[i] = { ...points[i], t: Math.min(1, points[i - 1].t + 0.001) };
  }
  return points.slice(0, MAX_ZOOM_KEYFRAMES);
}

function sampleZoomKeyframes(kfs, progress) {
  const path = normalizeZoomKeyframes(kfs);
  if (path.length === 0) return null;
  const p = Math.max(0, Math.min(1, progress));
  if (path.length === 1 || p <= path[0].t) return { zoom: path[0].zoom, panX: path[0].panX, panY: path[0].panY };
  const last = path[path.length - 1];
  if (p >= last.t) return { zoom: last.zoom, panX: last.panX, panY: last.panY };
  let i = 0;
  while (i < path.length - 1 && path[i + 1].t < p) i++;
  const a = path[i], b = path[i + 1];
  const u = (p - a.t) / Math.max(1e-6, b.t - a.t);
  return { zoom: a.zoom + (b.zoom - a.zoom) * u, panX: a.panX + (b.panX - a.panX) * u, panY: a.panY + (b.panY - a.panY) * u };
}

function buildZoomChannelExpr(kfs, wall, channel) {
  const path = normalizeZoomKeyframes(kfs);
  const dur = Math.max(0.05, wall);
  const valOf = (k) => (channel === "zoom" ? k.zoom : (channel === "panX" ? k.panX : k.panY) / 100);
  if (path.length === 0) return channel === "zoom" ? "1" : "0.5";
  if (path.length === 1) return valOf(path[0]).toFixed(6);
  let expr = valOf(path[path.length - 1]).toFixed(6);
  for (let i = path.length - 2; i >= 0; i--) {
    const a = path[i], b = path[i + 1];
    const t0 = a.t * dur, t1 = b.t * dur;
    const span = Math.max(1e-6, t1 - t0);
    const seg = `${valOf(a).toFixed(6)}+(${(valOf(b) - valOf(a)).toFixed(6)})*(t-${t0.toFixed(4)})/${span.toFixed(6)}`;
    expr = `if(lt(t\\,${t1.toFixed(4)})\\,${seg}\\,${expr})`;
  }
  const first = path[0];
  expr = `if(lt(t\\,${(first.t * dur).toFixed(4)})\\,${valOf(first).toFixed(6)}\\,${expr})`;
  return expr;
}

// Evaluate an ffmpeg-style if(lt(...)) expression at a given t (unescape commas).
function evalExpr(expr, t) {
  // Build a JS-evaluable version: if(a,b,c) -> (a?b:c), lt(x,y) -> (x<y)
  let s = expr.replace(/\\,/g, ",");
  // Convert innermost lt(x,y) comparisons first.
  s = s.replace(/lt\(([^()]+)\)/g, (_, inner) => {
    const [x, y] = inner.split(",");
    return `(${x}<${y})`;
  });
  // Manual recursive-descent replace for if(a,b,c).
  function convertIf(str) {
    const idx = str.indexOf("if(");
    if (idx === -1) return str;
    // find matching parens
    let depth = 0, i = idx + 2, start = i;
    const parts = [];
    let partStart = idx + 3;
    for (i = idx + 2; i < str.length; i++) {
      const ch = str[i];
      if (ch === "(") depth++;
      else if (ch === ")") { depth--; if (depth === 0) { parts.push(str.slice(partStart, i)); break; } }
      else if (ch === "," && depth === 1) { parts.push(str.slice(partStart, i)); partStart = i + 1; }
    }
    const [a, b, c] = parts;
    const replaced = `(${convertIf(a)}?${convertIf(b)}:${convertIf(c)})`;
    return convertIf(str.slice(0, idx) + replaced + str.slice(i + 1));
  }
  s = convertIf(s);
  // eslint-disable-next-line no-new-func
  return Function("t", `return (${s});`)(t);
}

// --- Tests ---
const wall = 5;
const kfs = [
  { id: "a", t: 0, zoom: 1, panX: 50, panY: 50 },
  { id: "b", t: 1, zoom: 2.5, panX: 90, panY: 40 },
];

// Sampling endpoints + midpoint
const s0 = sampleZoomKeyframes(kfs, 0);
const s1 = sampleZoomKeyframes(kfs, 1);
const sm = sampleZoomKeyframes(kfs, 0.5);
assert.ok(Math.abs(s0.zoom - 1) < 1e-9 && Math.abs(s0.panX - 50) < 1e-9, "start = first kf");
assert.ok(Math.abs(s1.zoom - 2.5) < 1e-9 && Math.abs(s1.panX - 90) < 1e-9, "end = last kf");
assert.ok(Math.abs(sm.zoom - 1.75) < 1e-9, "midpoint zoom interpolates");
assert.ok(Math.abs(sm.panX - 70) < 1e-9, "midpoint panX interpolates");

// Clamp + sort + dedupe
const messy = normalizeZoomKeyframes([
  { t: 1.2, zoom: 9, panX: -5, panY: 200 },
  { t: -0.3, zoom: 0.2, panX: 10, panY: 10 },
  { t: 0.5, zoom: 2, panX: 50, panY: 50 },
]);
assert.equal(messy.length, 3);
assert.ok(messy[0].t <= messy[1].t && messy[1].t <= messy[2].t, "sorted by t");
assert.ok(messy.every((k) => k.zoom >= 1 && k.zoom <= 4), "zoom clamped 1..4");
assert.ok(messy.every((k) => k.panX >= 0 && k.panX <= 100 && k.panY >= 0 && k.panY <= 100), "pan clamped");

// ffmpeg expression matches the sampler at several times (progress = t/wall)
const zExpr = buildZoomChannelExpr(kfs, wall, "zoom");
const pxExpr = buildZoomChannelExpr(kfs, wall, "panX");
for (const tt of [0, 1.25, 2.5, 3.75, 5]) {
  const prog = tt / wall;
  const samp = sampleZoomKeyframes(kfs, prog);
  const zval = evalExpr(zExpr, tt);
  const pxval = evalExpr(pxExpr, tt);
  assert.ok(Math.abs(zval - samp.zoom) < 1e-4, `zoom expr matches sampler @${tt}s (${zval} vs ${samp.zoom})`);
  assert.ok(Math.abs(pxval - samp.panX / 100) < 1e-4, `panX expr matches sampler @${tt}s`);
}

// Monotonic zoom growth for a pure push-in
let prevZ = -1;
for (let tt = 0; tt <= 5.0001; tt += 0.5) {
  const z = evalExpr(zExpr, Math.min(5, tt));
  assert.ok(z >= prevZ - 1e-9, "zoom never decreases for a push-in path");
  prevZ = z;
}

// Empty path → static fallback expressions
assert.equal(buildZoomChannelExpr([], wall, "zoom"), "1");
assert.equal(buildZoomChannelExpr([], wall, "panX"), "0.5");

console.log("zoom keyframe tests passed");
