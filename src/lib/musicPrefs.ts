import { clampMusicStartAt } from "./defaults";

export const MUSIC_START_PREFS_KEY = "rankshorts-music-start-prefs-v1";

/** Per-song Look BGM start offsets, keyed by mediaId. */
export function parseMusicStartPrefs(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    out[key] = clampMusicStartAt(value, 0);
  }
  return out;
}

export function getMusicStartFromPrefs(
  prefs: Record<string, number>,
  mediaId: string | null | undefined
): number {
  if (!mediaId) return 0;
  return clampMusicStartAt(prefs[mediaId], 0);
}

export function withMusicStartPref(
  prefs: Record<string, number>,
  mediaId: string | null | undefined,
  startAt: number
): Record<string, number> {
  if (!mediaId) return prefs;
  return { ...prefs, [mediaId]: clampMusicStartAt(startAt) };
}

export function loadMusicStartPrefs(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MUSIC_START_PREFS_KEY);
    if (!raw) return {};
    return parseMusicStartPrefs(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Saved start for this song, or 0 if none. */
export function getSavedMusicStartAt(mediaId: string | null | undefined): number {
  return getMusicStartFromPrefs(loadMusicStartPrefs(), mediaId);
}

/** Remember this song's start so picking it again restores the skip. */
export function saveMusicStartAt(
  mediaId: string | null | undefined,
  startAt: number
) {
  if (typeof window === "undefined" || !mediaId) return;
  try {
    const next = withMusicStartPref(loadMusicStartPrefs(), mediaId, startAt);
    localStorage.setItem(MUSIC_START_PREFS_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
}
