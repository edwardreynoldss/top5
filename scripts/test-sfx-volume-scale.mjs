import assert from "node:assert/strict";

const SFX_VOLUME_UI_SCALE = 0.2;

function sfxUiVolume(assetVolume, placementVolume) {
  const a = typeof assetVolume === "number" && Number.isFinite(assetVolume) ? assetVolume : 1;
  const p =
    typeof placementVolume === "number" && Number.isFinite(placementVolume) ? placementVolume : 1;
  return Math.max(0, Math.min(3, a * p));
}

function effectiveSfxVolume(assetVolume, placementVolume) {
  return Math.max(0, Math.min(3, sfxUiVolume(assetVolume, placementVolume) * SFX_VOLUME_UI_SCALE));
}

// Default UI 100% × 100% → real 20%
assert.equal(sfxUiVolume(1, 1), 1);
assert.ok(Math.abs(effectiveSfxVolume(1, 1) - 0.2) < 1e-9);

// Slider at 50% overall × 100% hit → UI 50%, real 10%
assert.ok(Math.abs(sfxUiVolume(0.5, 1) - 0.5) < 1e-9);
assert.ok(Math.abs(effectiveSfxVolume(0.5, 1) - 0.1) < 1e-9);

// Both boosted to 200% → UI 400% capped? a*p=4 capped to 3 → real 0.6
assert.equal(sfxUiVolume(2, 2), 3);
assert.ok(Math.abs(effectiveSfxVolume(2, 2) - 0.6) < 1e-9);

console.log("sfx volume ui scale tests passed");
