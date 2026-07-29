"use client";

import { useRef } from "react";
import { useEditor } from "@/lib/store";
import { Upload, Music2 } from "lucide-react";
import type { AspectMode, PlayOrder, TransitionType } from "@/lib/types";

export function SettingsPanel() {
  const { project, updateSettings, setPlayOrder, setTransition } = useEditor();
  const { settings } = project;
  const musicRef = useRef<HTMLInputElement>(null);

  async function uploadMusic(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Music upload failed");
      return;
    }
    updateSettings({ musicMediaId: data.mediaId, musicUrl: data.mediaUrl });
  }

  return (
    <section className="panel tab-panel">
      <div className="panel-header compact">
        <h2>Playback & look</h2>
        <p className="muted">Order, transitions, fit, music</p>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Play order</span>
          <select
            className="input"
            value={settings.playOrder}
            onChange={(e) => setPlayOrder(e.target.value as PlayOrder)}
          >
            <option value="countdown">Countdown (#5 → #1) — best for retention</option>
            <option value="ascending">Ascending (#1 → #5)</option>
          </select>
        </label>

        <label className="field">
          <span>Transition</span>
          <select
            className="input"
            value={settings.transition}
            onChange={(e) => setTransition(e.target.value as TransitionType)}
          >
            <option value="cut">Hard cut</option>
            <option value="flash">White flash</option>
            <option value="zoom">Zoom punch</option>
          </select>
        </label>

        <label className="field">
          <span>Transition length ({settings.transitionDuration.toFixed(2)}s)</span>
          <input
            type="range"
            min={0.1}
            max={0.5}
            step={0.05}
            value={settings.transitionDuration}
            onChange={(e) =>
              updateSettings({ transitionDuration: parseFloat(e.target.value) })
            }
          />
        </label>

        <label className="field">
          <span>Vertical fit</span>
          <select
            className="input"
            value={settings.aspectMode}
            onChange={(e) =>
              updateSettings({ aspectMode: e.target.value as AspectMode })
            }
          >
            <option value="crop-fill">Fit to screen (fill / crop)</option>
            <option value="blur-pad">Blurred background (letterbox fill)</option>
          </select>
        </label>

        <label className="field">
          <span>Title vs video</span>
          <select
            className="input"
            value={settings.titleOverlap ? "overlap" : "below"}
            onChange={(e) =>
              updateSettings({ titleOverlap: e.target.value === "overlap" })
            }
          >
            <option value="overlap">Title overlaps video</option>
            <option value="below">Video starts below title</option>
          </select>
        </label>

        <label className="field">
          <span>Blur amount ({settings.blurAmount}px)</span>
          <input
            type="range"
            min={8}
            max={48}
            step={1}
            value={settings.blurAmount}
            onChange={(e) => updateSettings({ blurAmount: parseInt(e.target.value, 10) })}
            disabled={settings.aspectMode !== "blur-pad"}
          />
        </label>

        <label className="field check">
          <input
            type="checkbox"
            checked={settings.showRankList}
            onChange={(e) => updateSettings({ showRankList: e.target.checked })}
          />
          <span>Show persistent 1–5 rank list</span>
        </label>

        <label className="field check">
          <input
            type="checkbox"
            checked={settings.showActiveLabel}
            onChange={(e) => updateSettings({ showActiveLabel: e.target.checked })}
          />
          <span>Reveal label next to active rank</span>
        </label>

        <label className="field">
          <span>Clip volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.clipVolume}
            onChange={(e) => updateSettings({ clipVolume: parseFloat(e.target.value) })}
          />
        </label>
      </div>

      <div className="music-block">
        <div className="music-head">
          <Music2 size={16} />
          <span>Background music (optional)</span>
        </div>
        {settings.musicUrl ? (
          <div className="music-ready">
            <audio src={settings.musicUrl} controls />
            <label className="field">
              <span>Music volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.musicVolume}
                onChange={(e) =>
                  updateSettings({ musicVolume: parseFloat(e.target.value) })
                }
              />
            </label>
            <button
              className="btn ghost small"
              onClick={() => updateSettings({ musicMediaId: null, musicUrl: null })}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <button className="btn ghost small" onClick={() => musicRef.current?.click()}>
              <Upload size={14} /> Upload audio / video bed
            </button>
            <input
              ref={musicRef}
              type="file"
              accept="audio/*,video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMusic(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
