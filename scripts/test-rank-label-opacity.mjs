import assert from "node:assert/strict";

function clampUnitOpacity(n, fallback = 1) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback));
}

function labelOpacity({
  revealed,
  isActive,
  dimEnabled = true,
  dimOpacity = 0.35,
  activeOpacity = 1,
}) {
  if (!revealed) return 0;
  if (!dimEnabled) return 1;
  return isActive
    ? clampUnitOpacity(activeOpacity, 1)
    : clampUnitOpacity(dimOpacity, 0.35);
}

// Active clip: full label; past clip: dim; future: hidden
assert.equal(labelOpacity({ revealed: true, isActive: true }), 1);
assert.equal(labelOpacity({ revealed: true, isActive: false }), 0.35);
assert.equal(labelOpacity({ revealed: false, isActive: false }), 0);

// Custom opacities
assert.equal(
  labelOpacity({
    revealed: true,
    isActive: false,
    dimOpacity: 0.2,
  }),
  0.2
);
assert.equal(
  labelOpacity({
    revealed: true,
    isActive: true,
    activeOpacity: 0.9,
  }),
  0.9
);

// Dim off → all revealed labels full (numbers unaffected by this helper)
assert.equal(
  labelOpacity({ revealed: true, isActive: false, dimEnabled: false }),
  1
);

console.log("rank label opacity tests passed");
