import assert from "node:assert/strict";

/**
 * Mirrors ClipCard logic: new ingest resets trim/crop; re-edit keeps saved settings.
 */
function resolveTrimSession({ pendingMeta, savedSegments, savedCrop }) {
  const isNewIngest = !!pendingMeta;
  if (isNewIngest) {
    return {
      segments: [{ start: 0, end: Math.min(4, pendingMeta.duration || 4) }],
      crop: { zoom: 1, panX: 50, panY: 50 },
    };
  }
  return {
    segments: savedSegments,
    crop: savedCrop,
  };
}

const savedSegments = [
  { start: 1.25, end: 3.5 },
  { start: 5, end: 6.2 },
];
const savedCrop = { zoom: 1.4, panX: 35, panY: 60 };

// Re-edit (scissors): no pendingMeta → keep settings
{
  const session = resolveTrimSession({
    pendingMeta: null,
    savedSegments,
    savedCrop,
  });
  assert.deepEqual(session.segments, savedSegments);
  assert.deepEqual(session.crop, savedCrop);
}

// New upload: pendingMeta → fresh defaults
{
  const session = resolveTrimSession({
    pendingMeta: { mediaId: "x", duration: 12 },
    savedSegments,
    savedCrop,
  });
  assert.deepEqual(session.segments, [{ start: 0, end: 4 }]);
  assert.equal(session.crop.zoom, 1);
}

function clampVol(v) {
  return Math.max(0, Math.min(2, Number.isFinite(v) ? v : 1));
}
function effective(clipVol, master) {
  return Math.max(0, Math.min(2, clampVol(clipVol) * clampVol(master)));
}
assert.equal(effective(0.5, 1), 0.5);
assert.equal(effective(2, 0.5), 1);
assert.equal(effective(undefined, 1), 1);

console.log("clip volume + trim persist tests passed");
