"use client";

import { useEffect, useState } from "react";
import { TitleEditor } from "./TitleEditor";
import { SettingsPanel } from "./SettingsPanel";
import { SfxPanel } from "./SfxPanel";
import { OverlayPanel } from "./OverlayPanel";
import { defaultLeftUi, loadLeftUi, saveLeftUi, type LeftUiState } from "@/lib/persist";
import { useEditor } from "@/lib/store";

const TABS: { id: LeftUiState["activeTab"]; label: string; hint: string }[] = [
  { id: "title", label: "Title", hint: "Words, fonts, ranks" },
  { id: "look", label: "Look", hint: "Fit, transitions, music" },
  { id: "sfx", label: "SFX", hint: "Booms & hits" },
  { id: "overlays", label: "Text", hint: "Captions & objects" },
];

export function LeftSidebar() {
  const { saveStatus, sfxTabNonce, overlaysTabNonce } = useEditor();
  const [ui, setUi] = useState<LeftUiState>(defaultLeftUi);

  useEffect(() => {
    setUi(loadLeftUi());
  }, []);

  useEffect(() => {
    saveLeftUi(ui);
  }, [ui]);

  useEffect(() => {
    if (sfxTabNonce > 0) {
      setUi((u) => ({ ...u, activeTab: "sfx" }));
    }
  }, [sfxTabNonce]);

  useEffect(() => {
    if (overlaysTabNonce > 0) {
      setUi((u) => ({ ...u, activeTab: "overlays" }));
    }
  }, [overlaysTabNonce]);

  return (
    <aside className="left-col">
      <div className="left-sticky">
        <div className="left-tabs" role="tablist" aria-label="Editor sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={ui.activeTab === tab.id}
              className={`left-tab ${ui.activeTab === tab.id ? "active" : ""}`}
              onClick={() => setUi((u) => ({ ...u, activeTab: tab.id }))}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
            </button>
          ))}
        </div>
        <div className="save-pill" data-status={saveStatus}>
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Layout saved"
              : saveStatus === "error"
                ? "Save failed"
                : "Autosave on"}
        </div>
      </div>

      <div className="left-tab-panel" role="tabpanel">
        {ui.activeTab === "title" && (
          <TitleEditor
            sectionOpen={ui.titleOpen}
            onSectionOpenChange={(titleOpen) => setUi((u) => ({ ...u, titleOpen }))}
          />
        )}
        {ui.activeTab === "look" && <SettingsPanel />}
        {ui.activeTab === "sfx" && <SfxPanel />}
        {ui.activeTab === "overlays" && <OverlayPanel />}
      </div>
    </aside>
  );
}
