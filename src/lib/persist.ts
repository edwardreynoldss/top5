import {
  builtInDefaultSettings,
  createDefaultProject,
  normalizeCrop,
  normalizeBedMusic,
  normalizeHook,
  createSegment,
  clampClipSpeed,
  clampClipGap,
} from "./defaults";
import type { EditorProject, ProjectSettings, RankClip } from "./types";
import { DEFAULT_CLIP_DURATION } from "./types";

export const STORAGE_KEY = "rankshorts-project-v1";
export const UI_STORAGE_KEY = "rankshorts-ui-v1";
export const LAYOUT_STORAGE_KEY = "rankshorts-layout-default-v1";

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

/**
 * Layout defaults keep music bed + auto-pick preference.
 * Stickers are saved per upload channel instead (stripped here).
 */
export function layoutSettingsFromProject(settings: ProjectSettings): ProjectSettings {
  const next = JSON.parse(JSON.stringify(settings)) as ProjectSettings;
  next.sticker = builtInDefaultSettings().sticker;
  return next;
}

export function saveLayoutDefault(settings: ProjectSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify(layoutSettingsFromProject(settings))
    );
  } catch {
    // quota / private mode
  }
}

export function loadLayoutDefault(): ProjectSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProjectSettings>;
    const base = builtInDefaultSettings();
    return {
      ...base,
      ...parsed,
      title: {
        ...base.title,
        ...(parsed.title || {}),
        enabled: parsed.title?.enabled !== false,
        lines: parsed.title?.lines?.length ? parsed.title.lines : base.title.lines,
      },
      ranksLayout: {
        ...base.ranksLayout,
        ...(parsed.ranksLayout || {}),
      },
      sticker: {
        ...base.sticker,
        ...(parsed.sticker || {}),
      },
      rankColors: {
        ...base.rankColors,
        ...(parsed.rankColors || {}),
      },
      musicMediaId: parsed.musicMediaId ?? null,
      musicUrl: (() => {
        const id = parsed.musicMediaId;
        if (id && String(id).startsWith("music__")) {
          const name = String(id).slice("music__".length);
          return `/api/music/file/${encodeURIComponent(name)}`;
        }
        if (parsed.musicUrl?.startsWith("/api/music/") || parsed.musicUrl?.startsWith("/api/media/")) {
          return parsed.musicUrl;
        }
        if (id) return `/api/media/${id}`;
        return null;
      })(),
      musicVolume:
        typeof parsed.musicVolume === "number" && Number.isFinite(parsed.musicVolume)
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : base.musicVolume,
      // Off unless explicitly saved as true
      musicAutoFromFolder: parsed.musicAutoFromFolder === true,
    };
  } catch {
    return null;
  }
}

export function clearLayoutDefault() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
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
    crop: normalizeCrop(clip.crop),
    volume:
      typeof clip.volume === "number" && Number.isFinite(clip.volume)
        ? Math.max(0, Math.min(2, clip.volume))
        : 1,
    speed: clampClipSpeed(
      typeof clip.speed === "number" && Number.isFinite(clip.speed) ? clip.speed : 1
    ),
    bedMusic: normalizeBedMusic(clip.bedMusic),
    hook: normalizeHook(
      clip.hook,
      typeof clip.duration === "number" && clip.duration > 0 ? clip.duration : Infinity
    ),
    gapAfter: clampClipGap(
      typeof clip.gapAfter === "number" && Number.isFinite(clip.gapAfter) ? clip.gapAfter : 0
    ),
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

/** Normalize a raw/partial project (localStorage or archive restore). */
export function normalizeProject(
  parsed: Partial<EditorProject> | null | undefined,
  layout?: ProjectSettings | null
): EditorProject {
  const fallback = createDefaultProject(layout || loadLayoutDefault() || undefined);
  if (!parsed || typeof parsed !== "object") return fallback;

  const ranks =
    (parsed.settings?.playOrder || fallback.settings.playOrder) === "ascending"
      ? [1, 2, 3, 4, 5]
      : [5, 4, 3, 2, 1];
  const clips = (parsed.clips && parsed.clips.length === 5
    ? parsed.clips
    : fallback.clips
  ).map((c, i) => normalizeClip(c, ranks[i]));

  return {
    ...fallback,
    ...parsed,
    clips,
    sfxAssets: (parsed.sfxAssets || []).map((a) => ({
      ...a,
      volume:
        typeof a.volume === "number" && Number.isFinite(a.volume)
          ? Math.max(0, Math.min(2, a.volume))
          : 1,
      // Never persist blob: URLs — restore from IndexedDB / server on hydrate
      mediaUrl: a.mediaId ? `/api/media/${a.mediaId}` : a.mediaUrl,
    })),
    sfxPlacements: parsed.sfxPlacements || [],
    exportSlot: parsed.exportSlot
      ? {
          channelSlug: String(parsed.exportSlot.channelSlug || ""),
          number: Math.max(1, Math.floor(Number(parsed.exportSlot.number) || 1)),
          version: Math.max(1, Math.floor(Number(parsed.exportSlot.version) || 1)),
        }
      : null,
    settings: {
      ...fallback.settings,
      ...(parsed.settings || {}),
      title: {
        ...fallback.settings.title,
        ...(parsed.settings?.title || {}),
        enabled: parsed.settings?.title?.enabled !== false,
        lines:
          parsed.settings?.title?.lines?.length
            ? parsed.settings.title.lines
            : fallback.settings.title.lines,
      },
      ranksLayout: {
        ...fallback.settings.ranksLayout,
        ...(parsed.settings?.ranksLayout || {}),
      },
      sticker: {
        ...fallback.settings.sticker,
        ...(parsed.settings?.sticker || {}),
        startAt:
          typeof parsed.settings?.sticker?.startAt === "number"
            ? parsed.settings.sticker.startAt
            : fallback.settings.sticker.startAt,
        duration:
          typeof parsed.settings?.sticker?.duration === "number"
            ? parsed.settings.sticker.duration
            : fallback.settings.sticker.duration,
        mediaUrl: parsed.settings?.sticker?.mediaId
          ? `/api/media/${parsed.settings.sticker.mediaId}`
          : parsed.settings?.sticker?.mediaUrl ?? fallback.settings.sticker.mediaUrl,
      },
      rankColors: {
        ...fallback.settings.rankColors,
        ...(parsed.settings?.rankColors || {}),
      },
      musicAutoFromFolder:
        typeof parsed.settings?.musicAutoFromFolder === "boolean"
          ? parsed.settings.musicAutoFromFolder
          : fallback.settings.musicAutoFromFolder,
      musicMediaId: parsed.settings?.musicMediaId ?? fallback.settings.musicMediaId,
      musicUrl: (() => {
        const id = parsed.settings?.musicMediaId;
        if (id && String(id).startsWith("music__")) {
          const name = String(id).slice("music__".length);
          return `/api/music/file/${encodeURIComponent(name)}`;
        }
        if (parsed.settings?.musicUrl?.startsWith("/api/music/")) {
          return parsed.settings.musicUrl;
        }
        if (parsed.settings?.musicUrl?.startsWith("/api/media/")) {
          return parsed.settings.musicUrl;
        }
        if (id) return `/api/media/${id}`;
        return null;
      })(),
      musicVolume:
        typeof parsed.settings?.musicVolume === "number" &&
        Number.isFinite(parsed.settings.musicVolume)
          ? Math.max(0, Math.min(1, parsed.settings.musicVolume))
          : fallback.settings.musicVolume,
    },
  };
}

export function loadProject(): EditorProject {
  const layout = loadLayoutDefault();
  if (typeof window === "undefined") {
    return createDefaultProject(layout || undefined);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProject(layout || undefined);
    return normalizeProject(JSON.parse(raw) as Partial<EditorProject>, layout);
  } catch {
    return createDefaultProject(layout || undefined);
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
      sfxAssets: (project.sfxAssets || []).map((a) => ({
        ...a,
        mediaUrl: a.mediaId ? `/api/media/${a.mediaId}` : a.mediaUrl,
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
