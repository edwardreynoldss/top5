"use client";

import { useState } from "react";
import { EditorProvider, useEditor } from "@/lib/store";
import { TopBar } from "./TopBar";
import { PreviewPhone } from "./PreviewPhone";
import { ClipList } from "./ClipList";
import { LeftSidebar } from "./LeftSidebar";

function EditorInner() {
  const { setSelectedClipId } = useEditor();
  const [isPlaying, setIsPlaying] = useState(false);

  function togglePlay() {
    setIsPlaying((p) => {
      const next = !p;
      if (next) {
        // Always play the full ranking timeline (not a single selected clip)
        setSelectedClipId(null);
      }
      return next;
    });
  }

  return (
    <div className="app-shell">
      <TopBar isPlaying={isPlaying} onTogglePlay={togglePlay} />
      <main className="editor-grid">
        <LeftSidebar />
        <section className="center-col">
          <PreviewPhone
            previewClip={null}
            isPlaying={isPlaying}
            onPlayingChange={(v) => {
              if (v) setSelectedClipId(null);
              setIsPlaying(v);
            }}
          />
          <p className="preview-hint">
            Full ranking preview · play to check every clip & transitions · layout autosaves
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
