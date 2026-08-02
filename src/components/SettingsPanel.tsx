"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { Upload, Music2, Bookmark, Sparkles } from "lucide-react";
import type { AspectMode, PlayOrder, TransitionType } from "@/lib/types";
import { defaultSticker } from "@/lib/defaults";

export function SettingsPanel() {
  const { project, updateSettings, setPlayOrder, setTransition, saveLayoutAsDefault } =
    useEditor();
  const { settings } = project;
  const musicRef = useRef<HTMLInputElement>(null);
  const stickerRef = useRef<HTMLInputElement>(null);
  const [layoutFlash, setLayoutFlash] = useState(false);
  const [stickerBusy, setStickerBusy] = useState(false);
  const sticker = settings.sticker ?? defaultSticker();

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

  async function uploadSticker(file: File) {
    setStickerBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "sticker");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Sticker upload failed");
        return;
      }
      updateSettings({
        sticker: {
          ...sticker,
          enabled: true,
          mediaId: data.mediaId,
          mediaUrl: data.mediaUrl,
          fileName: data.fileName || file.name,
          hasAlpha: Boolean(data.hasAlpha),
          duration: typeof data.duration === "number" ? data.duration : 0,
          startAt: Number.isFinite(sticker.startAt) ? sticker.startAt : 20,
        },
      });
      if (!data.hasAlpha) {
        alert(
          "Uploaded, but no alpha channel was detected. Use a Profounder “webm_transparent” export (or another VP9 alpha WebM) so the background stays clear."
        );
      }
    } finally {
      setStickerBusy(false);
    }
  }

  return (
    <section className="panel tab-panel">
      <div className="panel-header compact">
        <h2>Playback & look</h2>
        <p className="muted">Order, transitions, fit, sticker, music</p>
      </div>

      <div className="layout-default-row">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            saveLayoutAsDefault();
            setLayoutFlash(true);
            window.setTimeout(() => setLayoutFlash(false), 1800);
          }}
        >
          <Bookmark size={14} />
          {layoutFlash ? "Saved as default" : "Save as default layout"}
        </button>
        <p className="muted">
          Remembers title, ranks position, colors, sticker, and look. Reset clears clips but keeps
          this layout.
        </p>
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
          <span>Reveal labels as ranks play (names stay on screen)</span>
        </label>

        <label className="field">
          <span>Master clip volume</span>
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

      <div className="music-block sticker-block">
        <div className="music-head">
          <Sparkles size={16} />
          <span>Bottom sticker (transparent WebM)</span>
        </div>
        <p className="muted">
          Plays once at a time you choose on the ranking timeline (default 20s). Always muted —
          never loops for the whole video. Use a VP9 alpha WebM (Profounder{" "}
          <code>webm_transparent</code>).
        </p>
        {sticker.mediaUrl ? (
          <div className="music-ready">
            <video
              key={sticker.mediaUrl}
              src={sticker.mediaUrl}
              muted
              playsInline
              preload="metadata"
              className="sticker-settings-preview"
              onLoadedData={(e) => {
                e.currentTarget.muted = true;
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
            <label className="field check">
              <input
                type="checkbox"
                checked={sticker.enabled}
                onChange={(e) =>
                  updateSettings({ sticker: { ...sticker, enabled: e.target.checked } })
                }
              />
              <span>Show on preview &amp; export</span>
            </label>
            <label className="field">
              <span>Appear at ({sticker.startAt.toFixed(1)}s on timeline)</span>
              <input
                type="range"
                min={0}
                max={60}
                step={0.5}
                value={Math.max(0, Math.min(60, sticker.startAt ?? 20))}
                onChange={(e) =>
                  updateSettings({
                    sticker: { ...sticker, startAt: parseFloat(e.target.value) },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Or type seconds</span>
              <input
                className="input"
                type="number"
                min={0}
                max={600}
                step={0.5}
                value={Number.isFinite(sticker.startAt) ? sticker.startAt : 20}
                onChange={(e) =>
                  updateSettings({
                    sticker: {
                      ...sticker,
                      startAt: Math.max(0, parseFloat(e.target.value) || 0),
                    },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Size ({Math.round(sticker.scale * 100)}% of preview frame)</span>
              <input
                type="range"
                min={0.15}
                max={1.5}
                step={0.05}
                value={sticker.scale}
                onChange={(e) =>
                  updateSettings({
                    sticker: { ...sticker, scale: parseFloat(e.target.value) },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Speed ({sticker.speed.toFixed(2)}×)</span>
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={sticker.speed}
                onChange={(e) =>
                  updateSettings({
                    sticker: { ...sticker, speed: parseFloat(e.target.value) },
                  })
                }
              />
            </label>
            <p className="muted">
              {sticker.fileName || "sticker.webm"}
              {sticker.hasAlpha ? " · alpha OK" : " · no alpha detected"}
              {" · muted"}
              {sticker.duration > 0
                ? ` · ~${(sticker.duration / Math.max(0.25, sticker.speed)).toFixed(1)}s clip`
                : ""}
            </p>
            <div className="sticker-actions">
              <button
                className="btn ghost small"
                disabled={stickerBusy}
                onClick={() => stickerRef.current?.click()}
              >
                <Upload size={14} /> Replace
              </button>
              <button
                className="btn ghost small"
                onClick={() =>
                  updateSettings({
                    sticker: {
                      ...sticker,
                      enabled: false,
                      mediaId: null,
                      mediaUrl: null,
                      fileName: null,
                      hasAlpha: false,
                      duration: 0,
                    },
                  })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn ghost small"
            disabled={stickerBusy}
            onClick={() => stickerRef.current?.click()}
          >
            <Upload size={14} /> {stickerBusy ? "Uploading…" : "Upload transparent WebM"}
          </button>
        )}
        <input
          ref={stickerRef}
          type="file"
          accept="video/webm,.webm,video/quicktime,.mov"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadSticker(f);
            e.target.value = "";
          }}
        />
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
