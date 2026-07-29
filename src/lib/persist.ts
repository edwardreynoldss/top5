import { createDefaultProject, defaultCrop, createSegment } from "./defaults";
import type { EditorProject, RankClip } from "./types";
import { DEFAULT_CLIP_DURATION } from "./types";

export const STORAGE_KEY = "rankshorts-project-v1";
export const UI_STORAGE_KEY = "rankshorts-ui-v1";

export interface LeftUiState {
  activeTab: "title" | "look" | "sfx";
  titleOpen: Record<string, boolean>;
}

export function defaultLeftUi(): LeftUiState {
  return {
    activeTab: "title",
    titleOpen: {
      words: true,
      style: false,
      ranks: false,
    },
  };
}

function normalizeClip(clip: Partial<RankClip>, fallbackRank: number): RankClip {
  const base = createDefaultProject().clips.find((c) => c.rank === fallbackRank) ||
    createDefaultProject().clips[0];
  return {
    ...base,
    ...clip,
    rank: typeof clip.rank === "number" ? clip.rank : fallbackRank,
    id: clip.id || base.id,
    segments:
      clip.segments && clip.segments.length > 0
        ? clip.segments
        : [createSegment(clip.trimStart ?? 0, clip.trimEnd ?? DEFAULT_CLIP_DURATION)],
    crop: clip.crop || defaultCrop(),
    // Don't restore blob: URLs; keep server media paths
    mediaUrl:
      clip.mediaUrl && clip.mediaUrl.startsWith("/api/media/")
        ? clip.mediaUrl
        : clip.mediaId
          ? `/api/media/${clip.mediaId}`
          : null,
    status:
      clip.mediaId && (clip.mediaUrl?.startsWith("/api/media/") || clip.mediaId)
        ? "ready"
        : "empty",
  };
}

export function loadProject(): EditorProject {
  const fallback = createDefaultProject();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EditorProject>;
    const ranks = [5, 4, 3, 2, 1];
    const clips = (parsed.clips && parsed.clips.length === 5
      ? parsed.clips
      : fallback.clips
    ).map((c, i) => normalizeClip(c, ranks[i]));

    return {
      ...fallback,
      ...parsed,
      clips,
      sfxAssets: parsed.sfxAssets || [],
      sfxPlacements: parsed.sfxPlacements || [],
      settings: {
        ...fallback.settings,
        ...(parsed.settings || {}),
        title: {
          ...fallback.settings.title,
          ...(parsed.settings?.title || {}),
          lines:
            parsed.settings?.title?.lines?.length
              ? parsed.settings.title.lines
              : fallback.settings.title.lines,
        },
        ranksLayout: {
          ...fallback.settings.ranksLayout,
          ...(parsed.settings?.ranksLayout || {}),
        },
        rankColors: {
          ...fallback.settings.rankColors,
          ...(parsed.settings?.rankColors || {}),
        },
      },
    };
  } catch {
    return fallback;
  }
}

export function saveProject(project: EditorProject) {
  if (typeof window === "undefined") return;
  try {
    // Strip transient loading/error noise; keep structure
    const toSave: EditorProject = {
      ...project,
      clips: project.clips.map((c) => ({
        ...c,
        status: c.mediaId ? "ready" : "empty",
        error: undefined,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // quota / private mode
  }
}

export function loadLeftUi(): LeftUiState {
  if (typeof window === "undefined") return defaultLeftUi();
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return defaultLeftUi();
    return { ...defaultLeftUi(), ...JSON.parse(raw) };
  } catch {
    return defaultLeftUi();
  }
}

export function saveLeftUi(ui: LeftUiState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui));
  } catch {
    // ignore
  }
}

export function clearSavedProject() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
