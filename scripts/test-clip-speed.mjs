import assert from "node:assert/strict";

function clampClipSpeed(speed) {
  return Math.max(0.5, Math.min(2, Number.isFinite(speed) ? speed : 1));
}

function ffmpegAtempoChain(speed) {
  let rate = clampClipSpeed(speed);
  const parts = [];
  while (rate > 2.0001) {
    parts.push("atempo=2");
    rate /= 2;
  }
  while (rate < 0.4999) {
    parts.push("atempo=0.5");
    rate /= 0.5;
  }
  parts.push(`atempo=${Number(rate.toFixed(4))}`);
  return parts.join(",");
}

function clipPlayDuration(sourceSec, speed) {
  return Math.max(0.2, sourceSec / clampClipSpeed(speed));
}

assert.equal(clampClipSpeed(1), 1);
assert.equal(clampClipSpeed(0.25), 0.5);
assert.equal(clampClipSpeed(3), 2);
assert.equal(ffmpegAtempoChain(1), "atempo=1");
assert.equal(ffmpegAtempoChain(2), "atempo=2");
assert.equal(ffmpegAtempoChain(0.5), "atempo=0.5");
assert.ok(Math.abs(clipPlayDuration(10, 2) - 5) < 1e-9);
assert.ok(Math.abs(clipPlayDuration(10, 0.5) - 20) < 1e-9);
assert.ok(Math.abs(clipPlayDuration(4, 1) - 4) < 1e-9);

// wall ↔ source mapping
function wallFromSource(sourceProgress, speed) {
  return sourceProgress / clampClipSpeed(speed);
}
function sourceFromWall(wall, speed) {
  return wall * clampClipSpeed(speed);
}
assert.ok(Math.abs(wallFromSource(8, 2) - 4) < 1e-9);
assert.ok(Math.abs(sourceFromWall(4, 2) - 8) < 1e-9);

console.log("clip speed tests passed");
