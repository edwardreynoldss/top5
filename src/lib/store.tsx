"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createDefaultProject } from "./defaults";
import type {
  EditorProject,
  PlayOrder,
  ProjectSettings,
  RankClip,
  TitleConfig,
  TransitionType,
} from "./types";

interface EditorContextValue {
  project: EditorProject;
  selectedClipId: string | null;
  setSelectedClipId: (id: string | null) => void;
  updateTitle: (patch: Partial<TitleConfig>) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  updateClip: (id: string, patch: Partial<RankClip>) => void;
  reorderClips: (activeId: string, overId: string) => void;
  resetProject: () => void;
  setPlayOrder: (order: PlayOrder) => void;
  setTransition: (t: TransitionType) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<EditorProject>(() => createDefaultProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const updateTitle = useCallback((patch: Partial<TitleConfig>) => {
    setProject((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        title: { ...prev.settings.title, ...patch },
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

      // Reassign ranks based on play-order semantics:
      // list index 0 is first on screen in editor list; ranks stay 5→1 visually
      // when playOrder is countdown. We map position → rank number from settings.
      const ranks =
        prev.settings.playOrder === "countdown" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
      return {
        ...prev,
        clips: next.map((clip, i) => ({ ...clip, rank: ranks[i] ?? clip.rank })),
      };
    });
  }, []);

  const resetProject = useCallback(() => {
    setProject(createDefaultProject());
    setSelectedClipId(null);
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
      setSelectedClipId,
      updateTitle,
      updateSettings,
      updateClip,
      reorderClips,
      resetProject,
      setPlayOrder,
      setTransition,
    }),
    [
      project,
      selectedClipId,
      updateTitle,
      updateSettings,
      updateClip,
      reorderClips,
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
