import type { SfxAsset } from "./types";
import {
  deleteMediaBlob,
  getMediaBlob,
  mediaUrlReachable,
  putMediaBlob,
} from "./mediaCache";

export const SFX_LIBRARY_KEY = "rankshorts-sfx-library-v1";

/** Canonical play/serve URL for an SFX mediaId (folder drop vs uploaded). */
export function sfxMediaUrl(
  mediaId: string | null | undefined,
  fallbackUrl?: string | null
): string {
  if (!mediaId) return fallbackUrl || "";
  if (mediaId.startsWith("drop__")) {
    return `/api/sfx/file/${encodeURIComponent(mediaId.replace(/^drop__/, ""))}`;
  }
  if (fallbackUrl?.includes("/api/sfx/file/")) return fallbackUrl;
  return `/api/media/${mediaId}`;
}

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
            mediaUrl: sfxMediaUrl(a.mediaId, a.mediaUrl),
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
      mediaUrl: sfxMediaUrl(a.mediaId, a.mediaUrl),
    }));
    localStorage.setItem(SFX_LIBRARY_KEY, JSON.stringify(clean));
  } catch {
    // quota
  }
}

export function upsertSfxLibraryAsset(asset: SfxAsset) {
  const lib = loadSfxLibrary();
  const i = lib.findIndex((a) => a.id === asset.id || a.mediaId === asset.mediaId);
  const next = { ...asset, mediaUrl: sfxMediaUrl(asset.mediaId, asset.mediaUrl) };
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
  const isFolder =
    asset.mediaId.startsWith("drop__") ||
    Boolean(asset.mediaUrl?.includes("/api/sfx/file/"));

  if (isFolder) {
    const url = sfxMediaUrl(asset.mediaId, asset.mediaUrl);
    if (await mediaUrlReachable(url)) return url;
    throw new Error(
      `Folder SFX "${asset.fileName}" is missing from the sfx/ folder. Put the file back and retry.`
    );
  }

  const serverUrl = sfxMediaUrl(asset.mediaId, asset.mediaUrl);
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
  // Files dropped into /sfx are already on disk — never re-upload
  if (
    asset.mediaId.startsWith("drop__") ||
    asset.mediaUrl.includes("/api/sfx/file/")
  ) {
    const url = sfxMediaUrl(asset.mediaId, asset.mediaUrl);
    if (await mediaUrlReachable(url)) {
      return { ...asset, mediaUrl: url };
    }
    throw new Error(
      `Folder SFX "${asset.fileName}" is missing from the sfx/ folder. Put the file back and retry.`
    );
  }

  const serverUrl = sfxMediaUrl(asset.mediaId, asset.mediaUrl);
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
        mediaUrl: sfxMediaUrl(asset.mediaId, asset.mediaUrl),
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

/** Shared element so a prior user gesture keeps later previews unlockable. */
let previewAudio: HTMLAudioElement | null = null;
let previewStopHandler: (() => void) | null = null;

function getPreviewAudio() {
  if (typeof window === "undefined") return null;
  if (!previewAudio) {
    previewAudio = new Audio();
    previewAudio.preload = "auto";
  }
  return previewAudio;
}

function clearPreviewStop() {
  if (previewAudio && previewStopHandler) {
    previewAudio.removeEventListener("timeupdate", previewStopHandler);
  }
  previewStopHandler = null;
}

/** Stop any in-progress SFX sample preview. */
export function stopSfxPreview() {
  clearPreviewStop();
  if (previewAudio) {
    try {
      previewAudio.pause();
    } catch {
      // ignore
    }
  }
}

/**
 * Play an SFX sample from a click handler. Uses the correct folder/upload URL
 * synchronously so autoplay gesture is preserved, then falls back to blob if needed.
 */
export async function playSfxPreview(opts: {
  asset: SfxAsset;
  volume?: number;
  startAt?: number;
  stopAt?: number;
}): Promise<void> {
  const audio = getPreviewAudio();
  if (!audio) throw new Error("Audio preview is unavailable.");

  clearPreviewStop();
  audio.pause();

  const volume = Math.min(1, Math.max(0, opts.volume ?? opts.asset.volume ?? 1));
  audio.volume = volume;

  const primary = sfxMediaUrl(opts.asset.mediaId, opts.asset.mediaUrl);
  if (!primary) throw new Error("No audio URL for this sample.");

  const tryPlay = async (url: string) => {
    if (audio.src !== url) {
      audio.src = url;
    }
    // Seek after metadata when possible
    const seek = () => {
      if (opts.startAt != null && Number.isFinite(opts.startAt)) {
        try {
          audio.currentTime = Math.max(0, opts.startAt);
        } catch {
          // ignore
        }
      }
    };
    if (audio.readyState >= 1) seek();
    else {
      audio.addEventListener("loadedmetadata", seek, { once: true });
    }

    if (opts.stopAt != null && Number.isFinite(opts.stopAt)) {
      const stopAt = opts.stopAt;
      const onTime = () => {
        if (audio.currentTime >= stopAt - 0.03) {
          audio.pause();
          clearPreviewStop();
        }
      };
      previewStopHandler = onTime;
      audio.addEventListener("timeupdate", onTime);
    }

    await audio.play();
  };

  try {
    await tryPlay(primary);
  } catch (first) {
    // Wrong/stale URL or missing server file — try blob / corrected resolve
    try {
      const resolved = await resolveSfxPlayUrl(opts.asset);
      if (resolved && resolved !== primary) {
        await tryPlay(resolved);
        return;
      }
    } catch {
      // fall through
    }
    const name = first instanceof Error ? first.name : "";
    if (name === "NotAllowedError") {
      throw new Error(
        "Could not preview — click anywhere on the page, then try Play again."
      );
    }
    throw new Error(
      `Could not preview "${opts.asset.fileName || "SFX"}". Check the file is still in sfx/ or re-upload it.`
    );
  }
}
