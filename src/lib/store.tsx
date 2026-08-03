"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createDefaultProject, createWord, normalizeSticker } from "./defaults";
import {
  clearSavedProject,
  loadLayoutDefault,
  loadProject,
  normalizeProject,
  saveLayoutDefault,
  saveProject,
} from "./persist";
import { hydrateSfxAssets, loadSfxLibrary, upsertSfxLibraryAsset } from "./sfxLibrary";
import { fetchFilmArchive, saveFilmArchive } from "./projectHistory";
import {
  channelSlug,
  defaultChannelState,
  loadChannelState,
  saveChannelState,
  stickerForChannel,
  withChannelSticker,
  type ChannelExportState,
} from "./channels";
import type {
  EditorProject,
  PlayOrder,
  ProjectSettings,
  RankClip,
  RankLayout,
  SfxAsset,
  SfxPlacement,
  StickerOverlay,
  TitleConfig,
  TitleLine,
  TransitionType,
} from "./types";
import { v4 as uuidv4 } from "uuid";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface EditorContextValue {
  project: EditorProject;
  channelState: ChannelExportState;
  selectedClipId: string | null;
  saveStatus: SaveStatus;
  setSelectedClipId: (id: string | null) => void;
  updateTitle: (patch: Partial<TitleConfig>) => void;
  updateRanksLayout: (patch: Partial<RankLayout>) => void;
  setTitleLines: (lines: TitleLine[]) => void;
  updateTitleWord: (
    lineId: string,
    wordId: string,
    patch: Partial<{ text: string; color: string }>
  ) => void;
  addTitleWord: (lineId: string, text?: string, color?: string) => void;
  removeTitleWord: (lineId: string, wordId: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  /** Update live sticker + persist it on the active channel */
  updateSticker: (sticker: StickerOverlay | Partial<StickerOverlay>) => void;
  setActiveChannel: (slug: string) => void;
  addChannel: (name: string) => Promise<string | null>;
  setChannelState: (state: ChannelExportState) => void;
  updateClip: (id: string, patch: Partial<RankClip>) => void;
  reorderClips: (activeId: string, overId: string) => void;
  addSfxAsset: (asset: Omit<SfxAsset, "id"> & { id?: string }) => string;
  updateSfxAsset: (id: string, patch: Partial<Omit<SfxAsset, "id">>) => void;
  removeSfxAsset: (id: string) => void;
  addSfxPlacement: (placement?: Partial<SfxPlacement>) => string | null;
  updateSfxPlacement: (id: string, patch: Partial<SfxPlacement>) => void;
  removeSfxPlacement: (id: string) => void;
  selectedSfxPlacementId: string | null;
  setSelectedSfxPlacementId: (id: string | null) => void;
  sfxTabNonce: number;
  requestSfxTab: () => void;
  resetProject: () => void;
  /**
   * Open a previously saved film archive (full clips + settings).
   * Snapshots the current editor first when it has clips.
   */
  restoreFilmArchive: (archiveId: string) => Promise<void>;
  setExportSlot: (slot: EditorProject["exportSlot"]) => void;
  saveLayoutAsDefault: () => void;
  setPlayOrder: (order: PlayOrder) => void;
  setTransition: (t: TransitionType) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<EditorProject>(() => createDefaultProject());
  const [channelState, setChannelStateRaw] = useState<ChannelExportState>(() =>
    defaultChannelState()
  );
  const [hydrated, setHydrated] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSfxPlacementId, setSelectedSfxPlacementId] = useState<string | null>(null);
  const [sfxTabNonce, setSfxTabNonce] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelStateRef = useRef(channelState);
  channelStateRef.current = channelState;
  const projectRef = useRef(project);
  projectRef.current = project;

  const requestSfxTab = useCallback(() => {
    setSfxTabNonce((n) => n + 1);
  }, []);

  const setChannelState = useCallback((state: ChannelExportState) => {
    channelStateRef.current = state;
    setChannelStateRaw(state);
    saveChannelState(state);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const loaded = loadProject();
      const lib = loadSfxLibrary();
      // Merge durable library samples into the project so they remain reusable
      const byId = new Map((loaded.sfxAssets || []).map((a) => [a.id, a]));
      for (const a of lib) {
        if (!byId.has(a.id)) byId.set(a.id, a);
      }
      const merged = { ...loaded, sfxAssets: Array.from(byId.values()) };
      const hydratedAssets = await hydrateSfxAssets(merged.sfxAssets);

      let channels = loadChannelState();
      // Migrate: if active channel has no saved sticker but project does, keep it
      if (
        merged.settings.sticker?.mediaId &&
        !channels.stickersBySlug?.[channels.activeSlug]?.mediaId
      ) {
        channels = withChannelSticker(
          channels,
          channels.activeSlug,
          merged.settings.sticker
        );
      }

      // Seed empty channels from bundled public/stickers/channels/{slug}.webm
      try {
        const res = await fetch("/api/channels/stickers");
        if (res.ok) {
          const data = (await res.json()) as {
            stickers?: Record<
              string,
              {
                mediaId: string;
                mediaUrl: string;
                fileName: string;
                duration: number;
                hasAlpha: boolean;
              }
            >;
          };
          for (const [slug, meta] of Object.entries(data.stickers || {})) {
            if (channels.stickersBySlug?.[slug]?.mediaId) continue;
            channels = withChannelSticker(channels, slug, {
              enabled: true,
              mediaId: meta.mediaId,
              mediaUrl: meta.mediaUrl,
              fileName: meta.fileName,
              duration: meta.duration,
              hasAlpha: meta.hasAlpha,
              scale: 0.55,
              speed: 1,
              startAt: 20,
            });
          }
        }
      } catch {
        // offline / first paint — bundled sticker still works via stickerForChannel
      }

      const activeSticker = stickerForChannel(channels, channels.activeSlug);
      if (cancelled) return;
      channelStateRef.current = channels;
      setChannelStateRaw(channels);
      saveChannelState(channels);
      setProject({
        ...merged,
        sfxAssets: hydratedAssets,
        settings: { ...merged.settings, sticker: activeSticker },
      });
      setHydrated(true);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        saveProject(project);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [project, hydrated]);

  const updateTitle = useCallback((patch: Partial<TitleConfig>) => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        title: { ...prev.settings.title, ...patch },
      },
    }));
  }, []);

  const updateRanksLayout = useCallback((patch: Partial<RankLayout>) => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ranksLayout: { ...prev.settings.ranksLayout, ...patch },
      },
    }));
  }, []);

  const setTitleLines = useCallback((lines: TitleLine[]) => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        title: { ...prev.settings.title, lines },
      },
    }));
  }, []);

  const updateTitleWord = useCallback(
    (lineId: string, wordId: string, patch: Partial<{ text: string; color: string }>) => {
      setProject((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          title: {
            ...prev.settings.title,
            lines: prev.settings.title.lines.map((line) =>
              line.id !== lineId
                ? line
                : {
                    ...line,
                    words: line.words.map((w) =>
                      w.id === wordId ? { ...w, ...patch } : w
                    ),
                  }
            ),
          },
        },
      }));
    },
    []
  );

  const addTitleWord = useCallback((lineId: string, text = "WORD", color = "#39FF14") => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        title: {
          ...prev.settings.title,
          lines: prev.settings.title.lines.map((line) =>
            line.id !== lineId
              ? line
              : { ...line, words: [...line.words, createWord(text, color)] }
          ),
        },
      },
    }));
  }, []);

  const removeTitleWord = useCallback((lineId: string, wordId: string) => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        title: {
          ...prev.settings.title,
          lines: prev.settings.title.lines.map((line) =>
            line.id !== lineId
              ? line
              : { ...line, words: line.words.filter((w) => w.id !== wordId) }
          ),
        },
      },
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<ProjectSettings>) => {
    setProject((prev) => {
      const nextSettings = { ...prev.settings, ...patch };
      if (patch.sticker) {
        const sticker = normalizeSticker({
          ...prev.settings.sticker,
          ...patch.sticker,
        });
        nextSettings.sticker = sticker;
        const ch = withChannelSticker(
          channelStateRef.current,
          channelStateRef.current.activeSlug,
          sticker
        );
        channelStateRef.current = ch;
        setChannelStateRaw(ch);
        saveChannelState(ch);
      }
      return { ...prev, settings: nextSettings };
    });
  }, []);

  const updateSticker = useCallback(
    (sticker: StickerOverlay | Partial<StickerOverlay>) => {
      setProject((prev) => {
        const next = normalizeSticker({ ...prev.settings.sticker, ...sticker });
        const ch = withChannelSticker(
          channelStateRef.current,
          channelStateRef.current.activeSlug,
          next
        );
        channelStateRef.current = ch;
        setChannelStateRaw(ch);
        saveChannelState(ch);
        return { ...prev, settings: { ...prev.settings, sticker: next } };
      });
    },
    []
  );

  const setActiveChannel = useCallback((slug: string) => {
    const safe = channelSlug(slug);
    const prevCh = channelStateRef.current;
    if (prevCh.activeSlug === safe) return;
    const saved = withChannelSticker(
      prevCh,
      prevCh.activeSlug,
      projectRef.current.settings.sticker
    );
    const next = { ...saved, activeSlug: safe };
    channelStateRef.current = next;
    setChannelStateRaw(next);
    saveChannelState(next);
    const sticker = stickerForChannel(next, safe);
    setProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, sticker },
    }));
  }, []);

  const addChannel = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    let slug = channelSlug(trimmed);
    const existing = new Set(channelStateRef.current.channels.map((c) => c.slug));
    if (existing.has(slug)) {
      let i = 2;
      while (existing.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    const prevCh = withChannelSticker(
      channelStateRef.current,
      channelStateRef.current.activeSlug,
      projectRef.current.settings.sticker
    );
    const next: ChannelExportState = {
      ...prevCh,
      channels: [...prevCh.channels, { name: trimmed, slug }],
      activeSlug: slug,
      nextNumber: { ...prevCh.nextNumber, [slug]: 1 },
      stickersBySlug: {
        ...prevCh.stickersBySlug,
        [slug]: normalizeSticker(null),
      },
    };
    channelStateRef.current = next;
    setChannelStateRaw(next);
    saveChannelState(next);
    setProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, sticker: stickerForChannel(next, slug) },
    }));
    try {
      await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: trimmed }),
      });
    } catch {
      // folder created on export anyway
    }
    return slug;
  }, []);

  const updateClip = useCallback((id: string, patch: Partial<RankClip>) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const reorderClips = useCallback((activeId: string, overId: string) => {
    setProject((prev) => {
      const oldIndex = prev.clips.findIndex((c) => c.id === activeId);
      const newIndex = prev.clips.findIndex((c) => c.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;

      const next = [...prev.clips];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);

      const ranks =
        prev.settings.playOrder === "countdown" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
      return {
        ...prev,
        clips: next.map((clip, i) => ({ ...clip, rank: ranks[i] ?? clip.rank })),
      };
    });
  }, []);

  const addSfxAsset = useCallback((asset: Omit<SfxAsset, "id"> & { id?: string }) => {
    const id = asset.id || uuidv4();
    const next: SfxAsset = {
      ...asset,
      id,
      volume:
        typeof asset.volume === "number" && Number.isFinite(asset.volume)
          ? Math.max(0, Math.min(2, asset.volume))
          : 1,
    };
    upsertSfxLibraryAsset(next);
    setProject((prev) => {
      const existing = (prev.sfxAssets || []).filter(
        (a) => a.id !== id && a.mediaId !== asset.mediaId
      );
      return {
        ...prev,
        sfxAssets: [...existing, next],
      };
    });
    return id;
  }, []);

  const updateSfxAsset = useCallback((id: string, patch: Partial<Omit<SfxAsset, "id">>) => {
    setProject((prev) => {
      const sfxAssets = (prev.sfxAssets || []).map((a) =>
        a.id === id ? { ...a, ...patch } : a
      );
      const updated = sfxAssets.find((a) => a.id === id);
      if (updated) upsertSfxLibraryAsset(updated);
      return { ...prev, sfxAssets };
    });
  }, []);

  const removeSfxAsset = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      sfxAssets: (prev.sfxAssets || []).filter((a) => a.id !== id),
      sfxPlacements: (prev.sfxPlacements || []).filter((p) => p.assetId !== id),
    }));
  }, []);

  const addSfxPlacement = useCallback((placement?: Partial<SfxPlacement>) => {
    const id = uuidv4();
    let created: string | null = null;
    setProject((prev) => {
      const assets = prev.sfxAssets || [];
      const assetId = placement?.assetId || assets[0]?.id;
      if (!assetId) return prev;
      const asset = assets.find((a) => a.id === assetId);
      const trimEnd = Math.min(
        asset?.duration || 1,
        placement?.trimEnd ?? Math.min(1.5, asset?.duration || 1.5)
      );
      const next: SfxPlacement = {
        id,
        assetId,
        startAt: placement?.startAt ?? 0,
        clipId: placement?.clipId ?? null,
        offsetInClip: placement?.offsetInClip ?? 0,
        trimStart: placement?.trimStart ?? 0,
        trimEnd,
        volume: placement?.volume ?? 1,
      };
      created = id;
      return {
        ...prev,
        sfxPlacements: [...(prev.sfxPlacements || []), next],
      };
    });
    if (created) setSelectedSfxPlacementId(created);
    return created;
  }, []);

  const updateSfxPlacement = useCallback((id: string, patch: Partial<SfxPlacement>) => {
    setProject((prev) => ({
      ...prev,
      sfxPlacements: (prev.sfxPlacements || []).map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    }));
  }, []);

  const removeSfxPlacement = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      sfxPlacements: (prev.sfxPlacements || []).filter((p) => p.id !== id),
    }));
    setSelectedSfxPlacementId((cur) => (cur === id ? null : cur));
  }, []);

  const resetProject = useCallback(() => {
    clearSavedProject();
    const layout = loadLayoutDefault();
    const base = createDefaultProject(layout || undefined);
    // Keep durable SFX library samples; clear placements, clips, and export version slot
    const lib = loadSfxLibrary();
    // Keep the active channel's subscribe sticker across Reset
    const sticker = stickerForChannel(
      channelStateRef.current,
      channelStateRef.current.activeSlug
    );
    setProject({
      ...base,
      sfxAssets: lib,
      exportSlot: null,
      settings: { ...base.settings, sticker },
    });
    setSelectedClipId(null);
    setSelectedSfxPlacementId(null);
    setSaveStatus("saved");
  }, []);

  const restoreFilmArchive = useCallback(async (archiveId: string) => {
    const current = projectRef.current;
    const channels = channelStateRef.current;
    // Safety snapshot of whatever is open now (skipped if empty)
    try {
      await saveFilmArchive({
        project: current,
        reason: "pre-restore",
        channelSlug: current.exportSlot?.channelSlug || channels.activeSlug,
        channelName:
          channels.channels.find((c) => c.slug === channels.activeSlug)?.name,
      });
    } catch {
      // Still allow restore if safety snapshot fails
    }

    const { project: raw } = await fetchFilmArchive(archiveId);
    const normalized = normalizeProject(raw);
    const lib = loadSfxLibrary();
    const byId = new Map((normalized.sfxAssets || []).map((a) => [a.id, a]));
    for (const a of lib) {
      if (!byId.has(a.id)) byId.set(a.id, a);
    }
    const mergedAssets = await hydrateSfxAssets(Array.from(byId.values()));

    // Prefer sticker from the archived film; fall back to channel sticker
    const sticker = normalized.settings.sticker?.mediaId
      ? normalizeSticker(normalized.settings.sticker)
      : stickerForChannel(channels, channels.activeSlug);

    // Switch active channel to the film's channel when known (counters unchanged)
    const filmSlug = normalized.exportSlot?.channelSlug;
    if (filmSlug && channels.channels.some((c) => c.slug === filmSlug)) {
      const nextChannels = { ...channels, activeSlug: filmSlug };
      setChannelStateRaw(nextChannels);
      saveChannelState(nextChannels);
    }

    setProject({
      ...normalized,
      sfxAssets: mergedAssets,
      settings: { ...normalized.settings, sticker },
    });
    setSelectedClipId(null);
    setSelectedSfxPlacementId(null);
    setSaveStatus("saved");
  }, []);

  const setExportSlot = useCallback((slot: EditorProject["exportSlot"]) => {
    setProject((prev) => ({ ...prev, exportSlot: slot ?? null }));
  }, []);

  const saveLayoutAsDefault = useCallback(() => {
    saveLayoutDefault(project.settings);
    setSaveStatus("saved");
  }, [project.settings]);

  const setPlayOrder = useCallback((order: PlayOrder) => {
    setProject((prev) => {
      const ranks = order === "countdown" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
      return {
        ...prev,
        settings: { ...prev.settings, playOrder: order },
        clips: prev.clips.map((clip, i) => ({ ...clip, rank: ranks[i] ?? clip.rank })),
      };
    });
  }, []);

  const setTransition = useCallback((t: TransitionType) => {
    setProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, transition: t },
    }));
  }, []);

  const value = useMemo(
    () => ({
      project,
      channelState,
      selectedClipId,
      selectedSfxPlacementId,
      sfxTabNonce,
      saveStatus,
      setSelectedClipId,
      setSelectedSfxPlacementId,
      requestSfxTab,
      updateTitle,
      updateRanksLayout,
      setTitleLines,
      updateTitleWord,
      addTitleWord,
      removeTitleWord,
      updateSettings,
      updateSticker,
      setActiveChannel,
      addChannel,
      setChannelState,
      updateClip,
      reorderClips,
      addSfxAsset,
      updateSfxAsset,
      removeSfxAsset,
      addSfxPlacement,
      updateSfxPlacement,
      removeSfxPlacement,
      resetProject,
      restoreFilmArchive,
      setExportSlot,
      saveLayoutAsDefault,
      setPlayOrder,
      setTransition,
    }),
    [
      project,
      channelState,
      selectedClipId,
      selectedSfxPlacementId,
      sfxTabNonce,
      saveStatus,
      requestSfxTab,
      updateTitle,
      updateRanksLayout,
      setTitleLines,
      updateTitleWord,
      addTitleWord,
      removeTitleWord,
      updateSettings,
      updateSticker,
      setActiveChannel,
      addChannel,
      setChannelState,
      updateClip,
      reorderClips,
      addSfxAsset,
      updateSfxAsset,
      removeSfxAsset,
      addSfxPlacement,
      updateSfxPlacement,
      removeSfxPlacement,
      resetProject,
      restoreFilmArchive,
      setExportSlot,
      saveLayoutAsDefault,
      setPlayOrder,
      setTransition,
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
