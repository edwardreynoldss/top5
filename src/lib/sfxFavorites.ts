/** Persisted SFX favorites — starred sounds sort to the top of pickers. */

export const SFX_FAVORITES_KEY = "rankshorts-sfx-favorites-v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SFX_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SFX_FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // quota / private mode
  }
}

/** Favorite keys are mediaId (stable across project/folder/library). */
export function loadSfxFavoriteIds(): Set<string> {
  return new Set(readIds());
}

export function isSfxFavorite(mediaId: string | null | undefined): boolean {
  if (!mediaId) return false;
  return loadSfxFavoriteIds().has(mediaId);
}

export function toggleSfxFavorite(mediaId: string): boolean {
  const ids = readIds();
  const i = ids.indexOf(mediaId);
  if (i >= 0) {
    ids.splice(i, 1);
    writeIds(ids);
    return false;
  }
  ids.unshift(mediaId);
  writeIds(ids);
  return true;
}

export function setSfxFavorite(mediaId: string, favorite: boolean) {
  const ids = readIds().filter((id) => id !== mediaId);
  if (favorite) ids.unshift(mediaId);
  writeIds(ids);
}

export function removeSfxFavorite(mediaId: string) {
  writeIds(readIds().filter((id) => id !== mediaId));
}

/** Keep a star when a folder sample is renamed (mediaId follows the filename). */
export function renameSfxFavorite(oldMediaId: string, newMediaId: string) {
  if (!oldMediaId || !newMediaId || oldMediaId === newMediaId) return;
  const ids = readIds();
  const i = ids.indexOf(oldMediaId);
  if (i < 0) return;
  ids[i] = newMediaId;
  writeIds([...new Set(ids.filter(Boolean))]);
}

/** Favorites first (by favorite order), then A–Z by fileName. */
export function sortSfxWithFavorites<T extends { mediaId?: string | null; fileName: string }>(
  items: T[],
  favoriteIds: Set<string>
): T[] {
  const favOrder = new Map(Array.from(favoriteIds).map((id, i) => [id, i]));
  return items.slice().sort((a, b) => {
    const aFav = a.mediaId && favoriteIds.has(a.mediaId);
    const bFav = b.mediaId && favoriteIds.has(b.mediaId);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    if (aFav && bFav) {
      return (favOrder.get(a.mediaId!) ?? 0) - (favOrder.get(b.mediaId!) ?? 0);
    }
    return a.fileName.localeCompare(b.fileName);
  });
}
