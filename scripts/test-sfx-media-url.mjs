/**
 * Unit checks for SFX media URL resolution (folder drop vs uploaded).
 */
import assert from "node:assert/strict";

function sfxMediaUrl(mediaId, fallbackUrl) {
  if (!mediaId) return fallbackUrl || "";
  if (mediaId.startsWith("drop__")) {
    return `/api/sfx/file/${encodeURIComponent(mediaId.replace(/^drop__/, ""))}`;
  }
  if (fallbackUrl?.includes("/api/sfx/file/")) return fallbackUrl;
  return `/api/media/${mediaId}`;
}

assert.equal(
  sfxMediaUrl("drop__whoosh.mp3"),
  "/api/sfx/file/whoosh.mp3"
);
assert.equal(
  sfxMediaUrl("drop__My Hit.wav"),
  "/api/sfx/file/My%20Hit.wav"
);
assert.equal(
  sfxMediaUrl("abc-123.mp3"),
  "/api/media/abc-123.mp3"
);
// Must NOT rewrite folder ids to /api/media (the bug that broke preview)
assert.ok(!sfxMediaUrl("drop__hit.mp3").startsWith("/api/media/"));
assert.equal(
  sfxMediaUrl("x", "/api/sfx/file/kept.mp3"),
  "/api/sfx/file/kept.mp3"
);

console.log("sfx media url tests passed");
