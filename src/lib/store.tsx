"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createDefaultProject, createWord } from "./defaults";
import type {
  EditorProject,
  PlayOrder,
  ProjectSettings,
  RankClip,
  RankLayout,
  TitleConfig,
  TitleLine,
  TransitionType,
} from "./types";

interface EditorContextValue {
  project: EditorProject;
  selectedClipId: string | null;
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
      updateRanksLayout,
      setTitleLines,
      updateTitleWord,
      addTitleWord,
      removeTitleWord,
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
      updateRanksLayout,
      setTitleLines,
      updateTitleWord,
      addTitleWord,
      removeTitleWord,
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
