"use client";

import { useMemo, useState } from "react";
import { EditorProvider, useEditor } from "@/lib/store";
import { TopBar } from "./TopBar";
import { PreviewPhone } from "./PreviewPhone";
import { ClipList } from "./ClipList";
import { TitleEditor } from "./TitleEditor";
import { SettingsPanel } from "./SettingsPanel";
import { SfxPanel } from "./SfxPanel";

function EditorInner() {
  const { project, selectedClipId } = useEditor();
  const [isPlaying, setIsPlaying] = useState(false);

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId && c.status === "ready") || null,
    [project.clips, selectedClipId]
  );

  return (
    <div className="app-shell">
      <TopBar
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
      />
      <main className="editor-grid">
        <aside className="left-col">
          <TitleEditor />
          <SettingsPanel />
          <SfxPanel />
        </aside>
        <section className="center-col">
          <PreviewPhone
            previewClip={isPlaying ? null : selectedClip}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
          />
          <p className="preview-hint">
            Live 9:16 preview · blurred fill · persistent ranks · export burns the same layout
          </p>
        </section>
        <aside className="right-col">
          <ClipList />
        </aside>
      </main>
    </div>
  );
}

export function EditorShell() {
  return (
    <EditorProvider>
      <EditorInner />
    </EditorProvider>
  );
}
