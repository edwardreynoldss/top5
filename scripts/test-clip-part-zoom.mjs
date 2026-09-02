import assert from "node:assert/strict";

function clampCropZoom(zoom) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

function normalizeCrop(crop) {
  return {
    zoom: clampCropZoom(crop?.zoom ?? 1),
    panX:
      typeof crop?.panX === "number" && Number.isFinite(crop.panX)
        ? Math.max(0, Math.min(100, crop.panX))
        : 50,
    panY:
      typeof crop?.panY === "number" && Number.isFinite(crop.panY)
        ? Math.max(0, Math.min(100, crop.panY))
        : 50,
    cropTop: crop?.cropTop ?? 0,
    cropBottom: crop?.cropBottom ?? 0,
    cropLeft: crop?.cropLeft ?? 0,
    cropRight: crop?.cropRight ?? 0,
  };
}

function cropForSegment(clipCrop, seg) {
  const base = normalizeCrop(clipCrop);
  if (!seg) return base;
  return normalizeCrop({
    ...base,
    ...(typeof seg.zoom === "number" && Number.isFinite(seg.zoom)
      ? { zoom: seg.zoom }
      : {}),
    ...(typeof seg.panX === "number" && Number.isFinite(seg.panX)
      ? { panX: seg.panX }
      : {}),
    ...(typeof seg.panY === "number" && Number.isFinite(seg.panY)
      ? { panY: seg.panY }
      : {}),
  });
}

function normalizeSegments(segments, defaultSpeed = 1) {
  return segments
    .map((s) => {
      const next = {
        id: s.id,
        start: Math.max(0, s.start),
        end: Math.max(s.start + 0.2, s.end),
        speed:
          typeof s.speed === "number" && Number.isFinite(s.speed)
            ? s.speed
            : defaultSpeed,
      };
      if (typeof s.zoom === "number" && Number.isFinite(s.zoom)) {
        next.zoom = clampCropZoom(s.zoom);
      }
      if (typeof s.panX === "number" && Number.isFinite(s.panX)) {
        next.panX = Math.max(0, Math.min(100, s.panX));
      }
      if (typeof s.panY === "number" && Number.isFinite(s.panY)) {
        next.panY = Math.max(0, Math.min(100, s.panY));
      }
      return next;
    })
    .filter((s) => s.end > s.start);
}

function stripSegmentFraming(seg) {
  return {
    id: seg.id,
    start: seg.start,
    end: seg.end,
    speed: seg.speed,
  };
}

function groupRangesByFraming(ranges, clipCrop) {
  const groups = [];
  for (const range of ranges) {
    const key = framingKey(cropForSegment(clipCrop, range));
    const last = groups[groups.length - 1];
    if (last && framingKey(cropForSegment(clipCrop, last[0])) === key) {
      last.push(range);
    } else {
      groups.push([range]);
    }
  }
  return groups;
}

function framingKey(crop) {
  return `${crop.zoom.toFixed(3)}:${crop.panX.toFixed(2)}:${crop.panY.toFixed(2)}`;
}

function exportPieces(ranged, clipCrop, splitHook, wantsEndFx) {
  const framingGroups = splitHook
    ? [[ranged[0]], ...groupRangesByFraming(ranged.slice(1), clipCrop)]
    : groupRangesByFraming(ranged, clipCrop);
  return framingGroups.map((group, idx) => ({
    ranges: group,
    tag: splitHook && idx === 0 ? "hook" : `p${idx}`,
    endFx: idx === framingGroups.length - 1 && wantsEndFx,
  }));
}

function bedStartForPiece(songStart, elapsed, isHook) {
  return isHook ? 0 : songStart + elapsed;
}

const clipCrop = {
  zoom: 1.2,
  panX: 50,
  panY: 40,
  cropTop: 0.1,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
};

// No override → clip crop (legacy single-zoom clips stay unchanged)
const inherited = cropForSegment(clipCrop, { start: 0, end: 4, speed: 1 });
assert.equal(inherited.zoom, 1.2);
assert.equal(inherited.panY, 40);
assert.equal(inherited.cropTop, 0.1);

// Part punch-in keeps edge crop, replaces zoom/pan
const punched = cropForSegment(clipCrop, { zoom: 2.4, panX: 30, panY: 70 });
assert.equal(punched.zoom, 2.4);
assert.equal(punched.panX, 30);
assert.equal(punched.panY, 70);
assert.equal(punched.cropTop, 0.1);

// Other parts stay at clip zoom
const other = cropForSegment(clipCrop, { start: 4, end: 8 });
assert.equal(other.zoom, 1.2);

const segs = normalizeSegments([
  { id: "a", start: 0, end: 3, speed: 1, zoom: 2, panX: 20 },
  { id: "b", start: 5, end: 9, speed: 1.25 },
  { id: "c", start: 10, end: 12, speed: 1, zoom: 99 },
]);
assert.equal(segs[0].zoom, 2);
assert.equal(segs[0].panX, 20);
assert.equal(segs[1].zoom, undefined);
assert.equal(segs[2].zoom, 4);

const stripped = segs.map(stripSegmentFraming);
assert.equal(stripped[0].zoom, undefined);
assert.equal(stripped[0].start, 0);

const playback = [
  { start: 1, end: 2.5, speed: 1 },
  { start: 4, end: 8, speed: 1, zoom: 2.1 },
  { start: 10, end: 12, speed: 0.8, zoom: 1 },
];
const pieces = exportPieces(playback, clipCrop, true, true);
assert.equal(pieces.length, 3);
assert.equal(pieces[0].tag, "hook");
assert.equal(pieces[0].endFx, false);
assert.equal(pieces[1].tag, "p1");
assert.equal(pieces[2].endFx, true);
assert.equal(pieces[1].ranges[0].zoom, 2.1);
assert.equal(cropForSegment(clipCrop, pieces[0].ranges[0]).zoom, 1.2);
assert.equal(cropForSegment(clipCrop, pieces[1].ranges[0]).zoom, 2.1);

const sameZoom = exportPieces(
  [
    { start: 0, end: 2, speed: 1 },
    { start: 3, end: 6, speed: 1.2 },
  ],
  clipCrop,
  false,
  false
);
assert.equal(sameZoom.length, 1, "identical framing stays one encode");
assert.equal(sameZoom[0].ranges.length, 2);

const noGap = exportPieces(playback, clipCrop, false, false);
assert.equal(noGap[0].tag, "p0");
assert.ok(noGap.length >= 2);

let elapsed = 0;
const bed0 = bedStartForPiece(8, elapsed, true);
assert.equal(bed0, 0);
elapsed += 0; // hook has no bed
const bed1 = bedStartForPiece(8, elapsed, false);
assert.equal(bed1, 8);
elapsed += 4;
const bed2 = bedStartForPiece(8, elapsed, false);
assert.equal(bed2, 12);

console.log("clip part zoom tests passed");
