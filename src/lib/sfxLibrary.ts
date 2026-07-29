import type { SfxAsset } from "./types";
import {
  deleteMediaBlob,
  getMediaBlob,
  mediaUrlReachable,
  putMediaBlob,
} from "./mediaCache";

export const SFX_LIBRARY_KEY = "rankshorts-sfx-library-v1";

export function loadSfxLibrary(): SfxAsset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SFX_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SfxAsset[];
    return Array.isArray(parsed)
      ? parsed
          .filter((a) => a?.id && a?.mediaId)
          .map((a) => ({
            ...a,
            volume:
              typeof a.volume === "number" && Number.isFinite(a.volume)
                ? Math.max(0, Math.min(2, a.volume))
                : 1,
          }))
      : [];
  } catch {
    return [];
  }
}

export function saveSfxLibrary(assets: SfxAsset[]) {
  if (typeof window === "undefined") return;
  try {
    const clean = assets.map((a) => ({
      ...a,
      mediaUrl: a.mediaId ? `/api/media/${a.mediaId}` : a.mediaUrl,
    }));
    localStorage.setItem(SFX_LIBRARY_KEY, JSON.stringify(clean));
  } catch {
    // quota
  }
}

export function upsertSfxLibraryAsset(asset: SfxAsset) {
  const lib = loadSfxLibrary();
  const i = lib.findIndex((a) => a.id === asset.id || a.mediaId === asset.mediaId);
  const next = { ...asset, mediaUrl: `/api/media/${asset.mediaId}` };
  if (i >= 0) lib[i] = next;
  else lib.push(next);
  saveSfxLibrary(lib);
}

export function removeSfxLibraryAsset(id: string) {
  const lib = loadSfxLibrary().filter((a) => a.id !== id);
  saveSfxLibrary(lib);
}

export async function cacheSfxFile(mediaId: string, file: Blob, fileName: string) {
  await putMediaBlob(mediaId, file, fileName);
}

/** Restore a playable URL (server or local blob) for an SFX asset. */
export async function resolveSfxPlayUrl(asset: SfxAsset): Promise<string> {
  const serverUrl = asset.mediaId ? `/api/media/${asset.mediaId}` : asset.mediaUrl;
  if (serverUrl && (await mediaUrlReachable(serverUrl))) {
    return serverUrl;
  }
  const stored = await getMediaBlob(asset.mediaId);
  if (stored?.blob) {
    return URL.createObjectURL(stored.blob);
  }
  return serverUrl || asset.mediaUrl;
}

/**
 * Ensure the asset bytes exist on the server (re-upload from IndexedDB if needed).
 * Returns an updated asset with a valid mediaId/mediaUrl.
 */
export async function ensureSfxOnServer(asset: SfxAsset): Promise<SfxAsset> {
  const serverUrl = `/api/media/${asset.mediaId}`;
  if (await mediaUrlReachable(serverUrl)) {
    return { ...asset, mediaUrl: serverUrl };
  }

  const stored = await getMediaBlob(asset.mediaId);
  if (!stored?.blob) {
    throw new Error(
      `SFX "${asset.fileName}" is missing locally and on the server. Re-upload it.`
    );
  }

  const fd = new FormData();
  fd.append("file", stored.blob, stored.fileName || asset.fileName || "sfx.mp3");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to restore ${asset.fileName}`);

  const updated: SfxAsset = {
    ...asset,
    mediaId: data.mediaId,
    mediaUrl: data.mediaUrl,
    duration: data.duration || asset.duration,
  };
  // Keep blob under both old and new ids
  await putMediaBlob(data.mediaId, stored.blob, updated.fileName);
  upsertSfxLibraryAsset(updated);
  return updated;
}

export async function hydrateSfxAssets(assets: SfxAsset[]): Promise<SfxAsset[]> {
  const out: SfxAsset[] = [];
  for (const asset of assets) {
    try {
      const url = await resolveSfxPlayUrl(asset);
      out.push({
        ...asset,
        mediaUrl: url,
        volume:
          typeof asset.volume === "number" && Number.isFinite(asset.volume)
            ? Math.max(0, Math.min(2, asset.volume))
            : 1,
      });
    } catch {
      out.push({
        ...asset,
        volume:
          typeof asset.volume === "number" && Number.isFinite(asset.volume)
            ? Math.max(0, Math.min(2, asset.volume))
            : 1,
      });
    }
  }
  return out;
}

export async function forgetSfxLocal(assetId: string, mediaId: string) {
  removeSfxLibraryAsset(assetId);
  await deleteMediaBlob(mediaId);
}
