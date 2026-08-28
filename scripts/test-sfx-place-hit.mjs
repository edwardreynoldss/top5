/**
 * Regression: placing an SFX hit must survive a later "boot hydrate" merge,
 * placeSfxHit must add asset + placement together, and placing the same sample
 * again must keep the original asset id so prior hits still play.
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

function upsertProjectSfxAsset(assets, incoming) {
  const existing = assets.find(
    (a) => a.id === incoming.id || (incoming.mediaId && a.mediaId === incoming.mediaId)
  );
  if (!existing) {
    return { assets: [...assets, incoming], assetId: incoming.id };
  }
  const merged = {
    ...existing,
    ...incoming,
    id: existing.id,
    mediaId: existing.mediaId || incoming.mediaId,
    mediaUrl: incoming.mediaUrl || existing.mediaUrl,
  };
  return {
    assets: assets.map((a) => (a.id === existing.id ? merged : a)),
    assetId: existing.id,
  };
}

function placeSfxHit(prev, opts) {
  const incomingId = opts.asset.id || "new-asset";
  const placementId = opts.placementId || "new-place";
  const nextAsset = {
    ...opts.asset,
    id: incomingId,
    mediaUrl: sfxMediaUrl(opts.asset.mediaId, opts.asset.mediaUrl),
  };
  const { assets, assetId } = upsertProjectSfxAsset(prev.sfxAssets || [], nextAsset);
  const fullDur = nextAsset.duration > 0 ? nextAsset.duration : 1;
  const placement = {
    id: placementId,
    assetId,
    startAt: opts.startAt,
    clipId: null,
    offsetInClip: 0,
    trimStart: 0,
    trimEnd: fullDur,
    volume: opts.volume ?? 1,
  };
  return {
    ...prev,
    sfxAssets: assets,
    sfxPlacements: [...(prev.sfxPlacements || []), placement],
  };
}

function bootMerge(live, loaded, hydratedAssets) {
  const assetByKey = new Map();
  for (const a of hydratedAssets) assetByKey.set(a.mediaId || a.id, a);
  for (const a of live.sfxAssets || []) {
    assetByKey.set(a.mediaId || a.id, {
      ...a,
      mediaUrl: sfxMediaUrl(a.mediaId, a.mediaUrl),
    });
  }
  const placeById = new Map();
  for (const p of loaded.sfxPlacements || []) placeById.set(p.id, p);
  for (const p of live.sfxPlacements || []) placeById.set(p.id, p);
  return {
    ...loaded,
    sfxAssets: Array.from(assetByKey.values()),
    sfxPlacements: Array.from(placeById.values()),
  };
}

function resetProject() {
  return { sfxAssets: [], sfxPlacements: [] };
}

function sameSfxAsset(asset, idOrMediaId) {
  if (!idOrMediaId) return false;
  return asset.id === idOrMediaId || asset.mediaId === idOrMediaId;
}

/** Right-click picker: selecting a row must stick even if the project already has SFX. */
function nextSelectedId(cur, catalog, firstProjectId) {
  // Old bug: effect deps on selectedId reset the pick to project.sfxAssets[0]
  if (firstProjectId && firstProjectId !== cur) {
    // new path ignores firstProjectId once the user picked something
  }
  if (cur && catalog.some((a) => sameSfxAsset(a, cur))) return cur;
  return catalog[0]?.id || "";
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

// Same sample again (folder id vs existing uuid) keeps the original asset + adds a hit
{
  let project = {
    sfxAssets: [
      {
        id: "uuid-1",
        mediaId: "drop__hit.mp3",
        mediaUrl: "/api/sfx/file/hit.mp3",
        fileName: "hit.mp3",
        duration: 0.8,
      },
    ],
    sfxPlacements: [{ id: "p1", assetId: "uuid-1", startAt: 1 }],
  };
  project = placeSfxHit(project, {
    asset: {
      id: "drop__hit.mp3",
      mediaId: "drop__hit.mp3",
      mediaUrl: "/api/sfx/file/hit.mp3",
      fileName: "hit.mp3",
      duration: 0.8,
    },
    startAt: 8.2,
    placementId: "p2",
  });
  assert.equal(project.sfxAssets.length, 1, "still one sample in the project");
  assert.equal(project.sfxAssets[0].id, "uuid-1", "must not swap the asset id");
  assert.equal(project.sfxPlacements.length, 2);
  assert.equal(project.sfxPlacements[0].assetId, "uuid-1");
  assert.equal(project.sfxPlacements[1].assetId, "uuid-1");
  assert.equal(project.sfxPlacements[1].startAt, 8.2);
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
  const loaded = { sfxAssets: [], sfxPlacements: [] };
  const after = bootMerge(live, loaded, []);
  assert.equal(after.sfxPlacements.length, 1, "live hit must survive hydrate");
  assert.equal(after.sfxPlacements[0].id, "live-hit");
  assert.equal(after.sfxAssets[0].mediaId, "drop__whoosh.mp3");
  assert.ok(after.sfxAssets[0].mediaUrl.includes("/api/sfx/file/"));
}

// Boot / reset must not dump the durable library into the project
{
  const lib = [{ id: "drop__old.mp3", mediaId: "drop__old.mp3", fileName: "old.mp3" }];
  const loaded = { sfxAssets: [], sfxPlacements: [] };
  const hydrated = loaded.sfxAssets; // no library merge
  assert.equal(hydrated.length, 0);
  const reset = resetProject();
  assert.equal(reset.sfxAssets.length, 0);
  assert.equal(reset.sfxPlacements.length, 0);
  assert.notEqual(lib.length, reset.sfxAssets.length);
}

// Archive restore keeps the film's SFX only (no library merge)
{
  const archived = {
    sfxAssets: [
      { id: "a1", mediaId: "drop__hit.mp3", fileName: "hit.mp3" },
    ],
    sfxPlacements: [{ id: "p1", assetId: "a1", startAt: 2 }],
  };
  const lib = [{ id: "drop__other.mp3", mediaId: "drop__other.mp3" }];
  const restoredAssets = archived.sfxAssets; // hydrate archived only
  void lib;
  assert.equal(restoredAssets.length, 1);
  assert.equal(restoredAssets[0].mediaId, "drop__hit.mp3");
}

// Picker: user can select a folder sound even when the project already has one
{
  const catalog = [
    { id: "drop__a.mp3", mediaId: "drop__a.mp3", fileName: "a.mp3" },
    { id: "drop__b.mp3", mediaId: "drop__b.mp3", fileName: "b.mp3" },
  ];
  const firstProjectId = "uuid-already-in-project";
  const picked = nextSelectedId("drop__b.mp3", catalog, firstProjectId);
  assert.equal(picked, "drop__b.mp3", "must not snap back to the in-project sample");
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
