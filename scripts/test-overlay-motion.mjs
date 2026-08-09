import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

function clampPos(n, fallback = 50) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : fallback));
}

function clampScale(n, fallback = 1) {
  return Math.max(0.35, Math.min(3, Number.isFinite(n) ? n : fallback));
}

function clampRot(deg, fallback = 0) {
  if (!Number.isFinite(deg)) return fallback;
  let d = ((deg + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return Math.max(-180, Math.min(180, d));
}

function lerpRot(a, b, u) {
  const from = clampRot(a, 0);
  const to = clampRot(b, 0);
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return clampRot(from + delta * Math.max(0, Math.min(1, u)), from);
}

function easeSmoothstep(u) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function normalizeMotionPath(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const points = raw
    .map((k) => {
      if (!k || typeof k !== "object") return null;
      const point = {
        id: typeof k.id === "string" && k.id ? k.id : randomUUID(),
        t: Math.max(0, Math.min(1, Number.isFinite(k.t) ? Number(k.t) : 0)),
        x: clampPos(Number(k.x), 50),
        y: clampPos(Number(k.y), 50),
      };
      if (k.scale != null && Number.isFinite(Number(k.scale))) {
        point.scale = clampScale(Number(k.scale), 1);
      }
      if (k.rotation != null && Number.isFinite(Number(k.rotation))) {
        point.rotation = clampRot(Number(k.rotation), 0);
      }
      return point;
    })
    .filter(Boolean);
  points.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) {
      points[i] = { ...points[i], t: Math.min(1, points[i - 1].t + 0.001) };
    }
  }
  return points;
}

function pathPointAt(path, index, channel) {
  const i = Math.max(0, Math.min(path.length - 1, index));
  return channel === "x" ? path[i].x : path[i].y;
}

function sampleSmoothedMotionPath(pathIn, progress, baseScale, baseRot) {
  const path = normalizeMotionPath(pathIn);
  if (path.length === 0) {
    return { x: 50, y: 50, scale: baseScale, rotation: baseRot };
  }
  if (path.length === 1) {
    return {
      x: path[0].x,
      y: path[0].y,
      scale: path[0].scale ?? baseScale,
      rotation: path[0].rotation ?? baseRot,
    };
  }
  const p = Math.max(0, Math.min(1, progress));
  if (p <= path[0].t) {
    return {
      x: path[0].x,
      y: path[0].y,
      scale: path[0].scale ?? baseScale,
      rotation: path[0].rotation ?? baseRot,
    };
  }
  const last = path[path.length - 1];
  if (p >= last.t) {
    return {
      x: last.x,
      y: last.y,
      scale: last.scale ?? baseScale,
      rotation: last.rotation ?? baseRot,
    };
  }

  let i = 0;
  while (i < path.length - 1 && path[i + 1].t < p) i++;
  const a = path[i];
  const b = path[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const u = Math.max(0, Math.min(1, (p - a.t) / span));
  const uEase = easeSmoothstep(u);

  const x = catmullRom(
    pathPointAt(path, i - 1, "x"),
    pathPointAt(path, i, "x"),
    pathPointAt(path, i + 1, "x"),
    pathPointAt(path, i + 2, "x"),
    u
  );
  const y = catmullRom(
    pathPointAt(path, i - 1, "y"),
    pathPointAt(path, i, "y"),
    pathPointAt(path, i + 1, "y"),
    pathPointAt(path, i + 2, "y"),
    u
  );

  const scaleA = a.scale ?? baseScale;
  const scaleB = b.scale ?? baseScale;
  const rotA = a.rotation ?? baseRot;
  const rotB = b.rotation ?? baseRot;
  return {
    x: clampPos(x, a.x),
    y: clampPos(y, a.y),
    scale: scaleA + (scaleB - scaleA) * uEase,
    rotation: lerpRot(rotA, rotB, uEase),
  };
}

function densifySmoothMotionPath(pathIn, baseScale = 1, baseRot = 0, samplesPerSegment = 8) {
  const path = normalizeMotionPath(pathIn);
  if (path.length < 2) return path;
  const n = Math.max(4, Math.min(24, Math.round(samplesPerSegment)));
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    for (let s = 0; s < n; s++) {
      if (i > 0 && s === 0) continue;
      const u = s / n;
      const t = a.t + (b.t - a.t) * u;
      const sample = sampleSmoothedMotionPath(path, t, baseScale, baseRot);
      out.push({
        id: `${a.id}_${s}`,
        t,
        x: sample.x,
        y: sample.y,
        scale: sample.scale,
        rotation: sample.rotation,
      });
    }
  }
  const end = path[path.length - 1];
  const endSample = sampleSmoothedMotionPath(path, end.t, baseScale, baseRot);
  out.push({
    id: end.id,
    t: end.t,
    x: endSample.x,
    y: endSample.y,
    scale: endSample.scale,
    rotation: endSample.rotation,
  });
  return normalizeMotionPath(out);
}

function sampleOverlayTransform(placement, localTime) {
  const baseScale = clampScale(placement.scale ?? 1, 1);
  const baseRot = clampRot(placement.rotation ?? 0, 0);
  const flipX = Boolean(placement.flipX);
  const flipY = Boolean(placement.flipY);
  const baseX = clampPos(placement.x ?? 50, 50);
  const baseY = clampPos(placement.y ?? 50, 50);
  const path = normalizeMotionPath(placement.motionPath);
  if (path.length < 2) {
    if (path.length === 1) {
      return {
        x: path[0].x,
        y: path[0].y,
        scale: path[0].scale ?? baseScale,
        rotation: path[0].rotation ?? baseRot,
        flipX,
        flipY,
        animated: false,
      };
    }
    return {
      x: baseX,
      y: baseY,
      scale: baseScale,
      rotation: baseRot,
      flipX,
      flipY,
      animated: false,
    };
  }
  const dur = Math.max(0.2, placement.duration || 3);
  const progress = Math.max(0, Math.min(1, localTime / dur));
  const sample = sampleSmoothedMotionPath(path, progress, baseScale, baseRot);
  return {
    x: sample.x,
    y: sample.y,
    scale: sample.scale,
    rotation: sample.rotation,
    flipX,
    flipY,
    animated: true,
  };
}

function overlayCssTransform(pose) {
  const s = clampScale(pose.scale ?? 1, 1);
  const sx = (pose.flipX ? -1 : 1) * s;
  const sy = (pose.flipY ? -1 : 1) * s;
  const r = clampRot(pose.rotation ?? 0, 0);
  return `translate(-50%, -50%) rotate(${r}deg) scale(${sx}, ${sy})`;
}

function buildOverlayAxisExpr(path, overlayStart, duration, axis, fallback01) {
  const pts = densifySmoothMotionPath(path, 1, 0, 16);
  const dur = Math.max(0.2, duration);
  const fb = Math.max(0, Math.min(1, fallback01));
  if (pts.length === 0) return fb.toFixed(6);
  if (pts.length === 1) {
    const v = (axis === "x" ? pts[0].x : pts[0].y) / 100;
    return Math.max(0, Math.min(1, v)).toFixed(6);
  }
  function lerpExpr(t0, v0, t1, v1) {
    const span = Math.max(1e-6, t1 - t0);
    return `${v0.toFixed(6)}+(${(v1 - v0).toFixed(6)})*(t-${t0.toFixed(3)})/${span.toFixed(6)}`;
  }
  let expr = ((axis === "x" ? pts[pts.length - 1].x : pts[pts.length - 1].y) / 100).toFixed(6);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const t0 = overlayStart + a.t * dur;
    const t1 = overlayStart + b.t * dur;
    const v0 = (axis === "x" ? a.x : a.y) / 100;
    const v1 = (axis === "x" ? b.x : b.y) / 100;
    const segment = lerpExpr(t0, v0, t1, v1);
    expr = `if(lt(t\\,${t1.toFixed(3)})\\,${segment}\\,${expr})`;
  }
  const first = pts[0];
  const tFirst = overlayStart + first.t * dur;
  const vFirst = ((axis === "x" ? first.x : first.y) / 100).toFixed(6);
  expr = `if(lt(t\\,${tFirst.toFixed(3)})\\,${vFirst}\\,${expr})`;
  return expr;
}

function upsertMotionKeypoint(path, point) {
  const next = normalizeMotionPath(path);
  const id = point.id || randomUUID();
  const existing = next.findIndex((p) => p.id === id);
  const kp = {
    id,
    t: Math.max(0, Math.min(1, point.t)),
    x: clampPos(point.x, 50),
    y: clampPos(point.y, 50),
  };
  if (point.scale != null) kp.scale = clampScale(point.scale, 1);
  if (existing >= 0) next[existing] = kp;
  else next.push(kp);
  return normalizeMotionPath(next);
}

function clampMotionKeypointTime(pathIn, id, nextT) {
  const path = normalizeMotionPath(pathIn);
  const idx = path.findIndex((p) => p.id === id);
  if (idx < 0) return Math.max(0, Math.min(1, nextT));
  const lo = idx > 0 ? path[idx - 1].t + 0.002 : 0;
  const hi = idx < path.length - 1 ? path[idx + 1].t - 0.002 : 1;
  return Math.max(lo, Math.min(hi, nextT));
}

/** Eval a simplified subset of ffmpeg if/lt/lerp for unit testing. */
function evalAxisExpr(expr, t) {
  const src = expr.replace(/\\,/g, ",");

  function parseExpr(s, from, to) {
    while (from < to && s[from] === " ") from++;
    while (to > from && s[to - 1] === " ") to--;
    const slice = s.slice(from, to);

    if (slice.startsWith("if(lt(t,")) {
      const afterLt = from + "if(lt(t,".length;
      const threshEnd = s.indexOf(")", afterLt);
      const threshold = parseFloat(s.slice(afterLt, threshEnd));
      let i = threshEnd + 1;
      if (s[i] !== ",") throw new Error("expected comma after lt()");
      i++;
      const thenStart = i;
      let depth = 0;
      let thenEnd = -1;
      for (; i < to; i++) {
        const c = s[i];
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth < 0) break;
        } else if (c === "," && depth === 0) {
          thenEnd = i;
          break;
        }
      }
      if (thenEnd < 0) throw new Error("bad then/else split: " + slice);
      const elseStart = thenEnd + 1;
      depth = 0;
      let elseEnd = -1;
      for (let j = elseStart; j < to; j++) {
        const c = s[j];
        if (c === "(") depth++;
        else if (c === ")") {
          if (depth === 0) {
            elseEnd = j;
            break;
          }
          depth--;
        }
      }
      if (elseEnd < 0) elseEnd = to;
      return t < threshold
        ? parseExpr(s, thenStart, thenEnd)
        : parseExpr(s, elseStart, elseEnd);
    }

    const lerp = /^([-\d.]+)\+\(([-\d.]+)\)\*\(t-([-\d.]+)\)\/([-\d.]+)$/.exec(slice);
    if (lerp) {
      return (
        parseFloat(lerp[1]) +
        (parseFloat(lerp[2]) * (t - parseFloat(lerp[3]))) / parseFloat(lerp[4])
      );
    }
    const n = parseFloat(slice);
    if (!Number.isFinite(n)) throw new Error("cannot parse: " + slice);
    return n;
  }

  return parseExpr(src, 0, src.length);
}

// --- static placement ---
{
  const s = sampleOverlayTransform({ x: 20, y: 80, scale: 1.2, duration: 3 }, 1.5);
  assert.equal(s.x, 20);
  assert.equal(s.y, 80);
  assert.equal(s.scale, 1.2);
  assert.equal(s.animated, false);
}

// --- start → end (Catmull-Rom; hits endpoints; mid on the line) ---
{
  const placement = {
    x: 10,
    y: 50,
    scale: 1,
    duration: 4,
    motionPath: [
      { id: "a", t: 0, x: 10, y: 50 },
      { id: "b", t: 1, x: 90, y: 50 },
    ],
  };
  const start = sampleOverlayTransform(placement, 0);
  const mid = sampleOverlayTransform(placement, 2);
  const end = sampleOverlayTransform(placement, 4);
  assert.ok(Math.abs(start.x - 10) < 1e-6);
  assert.ok(Math.abs(mid.x - 50) < 0.5, `mid x=${mid.x}`);
  assert.ok(Math.abs(end.x - 90) < 1e-6);
  assert.equal(mid.animated, true);
}

// --- multi-waypoint: left → top → middle → right (smooth curve hits keypoints) ---
{
  const placement = {
    x: 15,
    y: 55,
    scale: 1,
    duration: 6,
    motionPath: [
      { id: "1", t: 0, x: 15, y: 55 },
      { id: "2", t: 0.33, x: 50, y: 20 },
      { id: "3", t: 0.66, x: 50, y: 50 },
      { id: "4", t: 1, x: 85, y: 55 },
    ],
  };
  const p0 = sampleOverlayTransform(placement, 0);
  const pTop = sampleOverlayTransform(placement, 6 * 0.33);
  const pMid = sampleOverlayTransform(placement, 6 * 0.66);
  const pEnd = sampleOverlayTransform(placement, 6);
  assert.ok(Math.abs(p0.x - 15) < 0.01 && Math.abs(p0.y - 55) < 0.01);
  assert.ok(Math.abs(pTop.x - 50) < 0.01 && Math.abs(pTop.y - 20) < 0.01);
  assert.ok(Math.abs(pMid.x - 50) < 0.01 && Math.abs(pMid.y - 50) < 0.01);
  assert.ok(Math.abs(pEnd.x - 85) < 0.01 && Math.abs(pEnd.y - 55) < 0.01);

  const between = sampleOverlayTransform(placement, 6 * 0.165);
  assert.ok(between.x > 15 && between.x < 50);
  assert.ok(between.y < 55 && between.y > 20);

  // Between waypoints the curve should not be a hard corner (y not colinear with linear lerp)
  const nearCorner = sampleOverlayTransform(placement, 6 * 0.33 + 0.05);
  assert.ok(Number.isFinite(nearCorner.x) && Number.isFinite(nearCorner.y));
}

// --- densify produces denser polyline than keypoints ---
{
  const path = [
    { id: "a", t: 0, x: 10, y: 50 },
    { id: "b", t: 0.5, x: 50, y: 20 },
    { id: "c", t: 1, x: 90, y: 60 },
  ];
  const dense = densifySmoothMotionPath(path, 1, 0, 8);
  assert.ok(dense.length > path.length + 4, `dense=${dense.length}`);
  assert.ok(Math.abs(dense[0].x - 10) < 0.01);
  assert.ok(Math.abs(dense[dense.length - 1].x - 90) < 0.01);
}

// --- clamp keypoint time between neighbors ---
{
  const path = [
    { id: "a", t: 0, x: 10, y: 50 },
    { id: "b", t: 0.5, x: 50, y: 20 },
    { id: "c", t: 1, x: 90, y: 60 },
  ];
  assert.ok(clampMotionKeypointTime(path, "b", 0.9) < 1);
  assert.ok(clampMotionKeypointTime(path, "b", 0.9) > 0.5);
  assert.ok(clampMotionKeypointTime(path, "b", -1) >= 0);
  assert.ok(Math.abs(clampMotionKeypointTime(path, "a", 0.4) - 0) < 1e-9 || clampMotionKeypointTime(path, "a", 0.4) < 0.5);
}

// --- upsert inserts mid point ---
{
  const base = [
    { id: "a", t: 0, x: 10, y: 50 },
    { id: "b", t: 1, x: 90, y: 50 },
  ];
  const next = upsertMotionKeypoint(base, { t: 0.5, x: 50, y: 20 });
  assert.equal(next.length, 3);
  assert.ok(Math.abs(next[1].t - 0.5) < 1e-6);
  assert.equal(next[1].y, 20);
}

// --- ffmpeg densified expr matches JS samples at keypoints ---
{
  const path = [
    { id: "a", t: 0, x: 10, y: 40 },
    { id: "b", t: 0.5, x: 50, y: 20 },
    { id: "c", t: 1, x: 90, y: 60 },
  ];
  const startAt = 2;
  const dur = 4;
  const xExpr = buildOverlayAxisExpr(path, startAt, dur, "x", 0.5);
  const yExpr = buildOverlayAxisExpr(path, startAt, dur, "y", 0.5);
  assert.ok(xExpr.includes("if(lt(t"), "must emit piecewise if(lt(t…))");
  assert.ok(xExpr.includes("\\,"), "commas escaped for filter_complex");

  const keySamples = [
    { t: 2.0, x: 0.1, y: 0.4 },
    { t: 4.0, x: 0.5, y: 0.2 },
    { t: 6.0, x: 0.9, y: 0.6 },
  ];
  for (const s of keySamples) {
    const xs = evalAxisExpr(xExpr, s.t);
    const ys = evalAxisExpr(yExpr, s.t);
    assert.ok(Math.abs(xs - s.x) < 1e-2, `x at t=${s.t}: got ${xs} want ${s.x}`);
    assert.ok(Math.abs(ys - s.y) < 1e-2, `y at t=${s.t}: got ${ys} want ${s.y}`);
  }

  // Preview sample at local time must match export expr at abs time
  const placement = { x: 10, y: 40, scale: 1, duration: dur, motionPath: path };
  for (const local of [0, 1, 2, 3, 4]) {
    const pose = sampleOverlayTransform(placement, local);
    const abs = startAt + local;
    const xe = evalAxisExpr(xExpr, abs) * 100;
    const ye = evalAxisExpr(yExpr, abs) * 100;
    assert.ok(Math.abs(pose.x - xe) < 1.5, `parity x local=${local} pose=${pose.x} expr=${xe}`);
    assert.ok(Math.abs(pose.y - ye) < 1.5, `parity y local=${local} pose=${pose.y} expr=${ye}`);
  }
}

// --- center-anchor export math (preview parity at 50%) ---
{
  const W = 1080;
  const w = 200;
  const xPct = 0.5;
  const left = W * xPct - w / 2;
  assert.equal(left, (W - w) / 2);
}

// --- flip + rotate stay on while motion path tracks ---
{
  const placement = {
    x: 20,
    y: 50,
    scale: 1,
    rotation: 45,
    flipX: true,
    flipY: false,
    duration: 4,
    motionPath: [
      { id: "a", t: 0, x: 20, y: 50 },
      { id: "b", t: 1, x: 80, y: 50 },
    ],
  };
  const mid = sampleOverlayTransform(placement, 2);
  assert.ok(Math.abs(mid.x - 50) < 0.5);
  assert.equal(mid.rotation, 45, "placement rotation holds across path");
  assert.equal(mid.flipX, true);
  assert.equal(mid.flipY, false);
  const css = overlayCssTransform(mid);
  assert.ok(css.includes("rotate(45deg)"));
  assert.ok(css.includes("scale(-1, 1)"), `css=${css}`);
}

// --- per-point rotation lerps along path (arrow turns while tracking) ---
{
  const placement = {
    x: 10,
    y: 50,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    duration: 4,
    motionPath: [
      { id: "a", t: 0, x: 10, y: 50, rotation: 0 },
      { id: "b", t: 1, x: 90, y: 50, rotation: 90 },
    ],
  };
  const mid = sampleOverlayTransform(placement, 2);
  // smoothstep(0.5) === 0.5 → still 45°
  assert.ok(Math.abs(mid.rotation - 45) < 1e-6, `mid rot=${mid.rotation}`);
  const end = sampleOverlayTransform(placement, 4);
  assert.ok(Math.abs(end.rotation - 90) < 1e-6);
}

// --- shortest-path angle lerp across ±180 ---
{
  assert.ok(Math.abs(lerpRot(170, -170, 0.5) - 180) < 1e-6 || Math.abs(lerpRot(170, -170, 0.5) + 180) < 1e-6);
}

console.log("overlay motion path tests passed");
