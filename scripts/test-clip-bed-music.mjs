import assert from "node:assert/strict";

function normalizeBedMusic(bed) {
  if (!bed?.mediaId) return undefined;
  const mediaId = String(bed.mediaId);
  let mediaUrl = bed.mediaUrl ?? null;
  if (!mediaUrl || mediaUrl.startsWith("blob:")) {
    if (mediaId.startsWith("music__")) {
      mediaUrl = `/api/music/file/${encodeURIComponent(mediaId.slice("music__".length))}`;
    } else {
      mediaUrl = `/api/media/${mediaId}`;
    }
  }
  const startAt =
    typeof bed.startAt === "number" && Number.isFinite(bed.startAt) ? Math.max(0, bed.startAt) : 0;
  const volume =
    typeof bed.volume === "number" && Number.isFinite(bed.volume)
      ? Math.max(0, Math.min(1, bed.volume))
      : 0.35;
  return { mediaId, mediaUrl, fileName: bed.fileName ?? null, startAt, volume };
}

assert.equal(normalizeBedMusic(null), undefined);
assert.equal(normalizeBedMusic({}), undefined);
assert.equal(normalizeBedMusic({ mediaId: null }), undefined);

const bed = normalizeBedMusic({
  mediaId: "music__lofi.mp3",
  fileName: "lofi.mp3",
  startAt: 12.5,
  volume: 0.5,
});
assert.equal(bed.mediaUrl, "/api/music/file/lofi.mp3");
assert.equal(bed.startAt, 12.5);
assert.equal(bed.volume, 0.5);

// Bed must not extend past clip wall duration
function bedPlayWindow(clipWallSec, bedStartAt, bedSourceDur) {
  const remainingInSong = Math.max(0, (bedSourceDur || 9999) - bedStartAt);
  return Math.min(clipWallSec, remainingInSong);
}
assert.equal(bedPlayWindow(4, 10, 60), 4, "clip caps bed");
assert.equal(bedPlayWindow(10, 55, 60), 5, "song end caps bed");

console.log("clip bed music tests passed");
