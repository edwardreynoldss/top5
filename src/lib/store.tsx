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
import { createDefaultProject, createWord } from "./defaults";
import { clearSavedProject, loadProject, saveProject } from "./persist";
import { hydrateSfxAssets, loadSfxLibrary, upsertSfxLibraryAsset } from "./sfxLibrary";
import type {
  EditorProject,
  PlayOrder,
  ProjectSettings,
  RankClip,
  RankLayout,
  SfxAsset,
  SfxPlacement,
  TitleConfig,
  TitleLine,
  TransitionType,
} from "./types";
import { v4 as uuidv4 } from "uuid";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface EditorContextValue {
  project: EditorProject;
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
  setPlayOrder: (order: PlayOrder) => void;
  setTransition: (t: TransitionType) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<EditorProject>(() => createDefaultProject());
  const [hydrated, setHydrated] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSfxPlacementId, setSelectedSfxPlacementId] = useState<string | null>(null);
  const [sfxTabNonce, setSfxTabNonce] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestSfxTab = useCallback(() => {
    setSfxTabNonce((n) => n + 1);
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
      if (cancelled) return;
      setProject({ ...merged, sfxAssets: hydratedAssets });
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
    setProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
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
    setProject(createDefaultProject());
    setSelectedClipId(null);
    setSaveStatus("saved");
  }, []);

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
      updateClip,
      reorderClips,
      addSfxAsset,
      updateSfxAsset,
      removeSfxAsset,
      addSfxPlacement,
      updateSfxPlacement,
      removeSfxPlacement,
      resetProject,
      setPlayOrder,
      setTransition,
    }),
    [
      project,
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
      updateClip,
      reorderClips,
      addSfxAsset,
      updateSfxAsset,
      removeSfxAsset,
      addSfxPlacement,
      updateSfxPlacement,
      removeSfxPlacement,
      resetProject,
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
