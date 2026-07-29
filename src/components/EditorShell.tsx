"use client";

import { useMemo, useState } from "react";
import { EditorProvider, useEditor } from "@/lib/store";
import { TopBar } from "./TopBar";
import { PreviewPhone } from "./PreviewPhone";
import { ClipList } from "./ClipList";
import { LeftSidebar } from "./LeftSidebar";

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
        <LeftSidebar />
        <section className="center-col">
          <PreviewPhone
            previewClip={isPlaying ? null : selectedClip}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
          />
          <p className="preview-hint">
            Live 9:16 preview · layout autosaves in this browser
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
