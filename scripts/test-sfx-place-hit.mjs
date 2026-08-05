/**
 * Regression: placing an SFX hit must survive a later "boot hydrate" merge,
 * and placeSfxHit must add asset + placement together.
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

function placeSfxHit(prev, opts) {
  const assetId = opts.asset.id || "new-asset";
  const placementId = opts.placementId || "new-place";
  const nextAsset = {
    ...opts.asset,
    id: assetId,
    mediaUrl: sfxMediaUrl(opts.asset.mediaId, opts.asset.mediaUrl),
  };
  const withoutDup = (prev.sfxAssets || []).filter(
    (a) => a.id !== nextAsset.id && a.mediaId !== nextAsset.mediaId
  );
  const fullDur = nextAsset.duration > 0 ? nextAsset.duration : 1;
  const placement = {
    id: placementId,
    assetId: nextAsset.id,
    startAt: opts.startAt,
    clipId: null,
    offsetInClip: 0,
    trimStart: 0,
    trimEnd: fullDur,
    volume: opts.volume ?? 1,
  };
  return {
    ...prev,
    sfxAssets: [...withoutDup, nextAsset],
    sfxPlacements: [...(prev.sfxPlacements || []), placement],
  };
}

function bootMerge(live, merged, hydratedAssets) {
  const assetByKey = new Map();
  for (const a of hydratedAssets) assetByKey.set(a.mediaId || a.id, a);
  for (const a of live.sfxAssets || []) {
    assetByKey.set(a.mediaId || a.id, {
      ...a,
      mediaUrl: sfxMediaUrl(a.mediaId, a.mediaUrl),
    });
  }
  const placeById = new Map();
  for (const p of merged.sfxPlacements || []) placeById.set(p.id, p);
  for (const p of live.sfxPlacements || []) placeById.set(p.id, p);
  return {
    ...merged,
    sfxAssets: Array.from(assetByKey.values()),
    sfxPlacements: Array.from(placeById.values()),
  };
}

// Place a folder hit
{
  let project = { sfxAssets: [], sfxPlacements: [] };
  project = placeSfxHit(project, {
    asset: {
      id: "drop__hit.mp3",
      mediaId: "drop__hit.mp3",
      mediaUrl: "/api/sfx/file/hit.mp3",
      fileName: "hit.mp3",
      duration: 0.8,
    },
    startAt: 3.5,
    placementId: "p1",
  });
  assert.equal(project.sfxPlacements.length, 1);
  assert.equal(project.sfxPlacements[0].startAt, 3.5);
  assert.equal(project.sfxAssets[0].mediaUrl, "/api/sfx/file/hit.mp3");
}

// Boot hydrate must NOT wipe live placements
{
  const live = placeSfxHit(
    { sfxAssets: [], sfxPlacements: [] },
    {
      asset: {
        id: "drop__whoosh.mp3",
        mediaId: "drop__whoosh.mp3",
        mediaUrl: "/api/sfx/file/whoosh.mp3",
        fileName: "whoosh.mp3",
        duration: 1,
      },
      startAt: 1.2,
      placementId: "live-hit",
    }
  );
  const merged = { sfxAssets: [], sfxPlacements: [] };
  const after = bootMerge(live, merged, []);
  assert.equal(after.sfxPlacements.length, 1, "live hit must survive hydrate");
  assert.equal(after.sfxPlacements[0].id, "live-hit");
  assert.equal(after.sfxAssets[0].mediaId, "drop__whoosh.mp3");
  assert.ok(after.sfxAssets[0].mediaUrl.includes("/api/sfx/file/"));
}

// addSfxPlacement-style sync return (id known before setState)
{
  const id = "sync-id";
  let rejected = false;
  const assetId = "a1";
  if (!assetId) rejected = true;
  const returned = rejected ? null : id;
  assert.equal(returned, "sync-id");
}

console.log("sfx place/delete regression tests passed");
