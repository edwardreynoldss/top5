import assert from "node:assert/strict";

function cropPanTranslatePct(crop, scale) {
  const s = Math.max(0.25, scale);
  const strength = Math.max(10, (s - 1) * 55 + 14);
  return {
    x: ((50 - (crop.panX ?? 50)) / 50) * strength,
    y: ((50 - (crop.panY ?? 50)) / 50) * strength,
  };
}

const mid = cropPanTranslatePct({ zoom: 1.5, panX: 50, panY: 50 }, 1.5);
assert.equal(mid.x, 0);
assert.equal(mid.y, 0);

const left = cropPanTranslatePct({ zoom: 1.5, panX: 0, panY: 50 }, 1.5);
assert.ok(left.x > 0, "focus left → video shifts right");

const right = cropPanTranslatePct({ zoom: 1.5, panX: 100, panY: 50 }, 1.5);
assert.ok(right.x < 0);

console.log("crop pan translate tests passed");
