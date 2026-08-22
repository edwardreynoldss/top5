"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import {
  Upload,
  Music2,
  Bookmark,
  Sparkles,
  RefreshCw,
  Shuffle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type {
  AspectMode,
  PlayOrder,
  RankListOrder,
  TransitionType,
} from "@/lib/types";
import {
  defaultSticker,
  defaultTransitionSound,
  rankListRanks,
  sortClipsForPlayback,
} from "@/lib/defaults";

type MusicFolderItem = {
  id: string;
  fileName: string;
  mediaId: string;
  mediaUrl: string;
  duration: number;
};

export function SettingsPanel() {
  const {
    project,
    channelState,
    updateSettings,
    updateSticker,
    setPlayOrder,
    setCustomOrder,
    shuffleCustomOrder,
    setTransition,
    saveLayoutAsDefault,
  } = useEditor();
  const { settings } = project;
  const musicRef = useRef<HTMLInputElement>(null);
  const stickerRef = useRef<HTMLInputElement>(null);
  const [layoutFlash, setLayoutFlash] = useState(false);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [musicFolder, setMusicFolder] = useState<MusicFolderItem[]>([]);
  const [musicFolderBusy, setMusicFolderBusy] = useState(false);
  const sticker = settings.sticker ?? defaultSticker();
  const activeChannel =
    channelState.channels.find((c) => c.slug === channelState.activeSlug) ||
    channelState.channels[0];
  const musicAuto = settings.musicAutoFromFolder === true;
  const orderedClips = sortClipsForPlayback(project.clips, settings);
  const screenRanks = rankListRanks(project.clips, settings);

  function moveInOrder(clipId: string, delta: number) {
    const ids = orderedClips.map((c) => c.id);
    const from = ids.indexOf(clipId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setCustomOrder(ids);
  }

  async function refreshMusicFolder(opts?: { autoPick?: boolean }) {
    setMusicFolderBusy(true);
    try {
      const res = await fetch("/api/music/library");
      const data = await res.json();
      const items: MusicFolderItem[] = Array.isArray(data.items) ? data.items : [];
      setMusicFolder(items);
      // Only auto-pick when explicitly requested AND the toggle is on
      const auto = opts?.autoPick === true && musicAuto;
      if (auto && !settings.musicMediaId && items.length > 0) {
        const pick = items[0];
        updateSettings({
          musicMediaId: pick.mediaId,
          musicUrl: pick.mediaUrl,
        });
      }
    } catch {
      setMusicFolder([]);
    } finally {
      setMusicFolderBusy(false);
    }
  }

  useEffect(() => {
    // List folder only — never auto-select on mount
    void refreshMusicFolder({ autoPick: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadMusic(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Music upload failed");
      return;
    }
    updateSettings({
      musicMediaId: data.mediaId,
      musicUrl: data.mediaUrl,
      musicAutoFromFolder: false,
    });
  }

  function selectFolderBed(item: MusicFolderItem) {
    updateSettings({
      musicMediaId: item.mediaId,
      musicUrl: item.mediaUrl,
    });
  }

  async function uploadSticker(file: File) {
    setStickerBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "sticker");
      fd.append("channelSlug", channelState.activeSlug);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Sticker upload failed");
        return;
      }
      updateSticker({
        ...sticker,
        enabled: true,
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName || file.name,
        hasAlpha: Boolean(data.hasAlpha),
        duration: typeof data.duration === "number" ? data.duration : 0,
        startAt: Number.isFinite(sticker.startAt) ? sticker.startAt : 20,
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
          Remembers title, ranks, colors, look, and background music. Subscribe stickers are saved
          per channel. Reset clears clips but keeps this layout.
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
            <option value="custom">Custom order (pick the sequence)</option>
          </select>
        </label>

        <label className="field">
          <span>Numbers on screen</span>
          <select
            className="input"
            value={settings.rankListOrder ?? "auto"}
            onChange={(e) =>
              updateSettings({ rankListOrder: e.target.value as RankListOrder })
            }
          >
            <option value="auto">Auto (follows play order)</option>
            <option value="descending">5 at top → 1 at bottom</option>
            <option value="ascending">1 at top → 5 at bottom</option>
          </select>
          <span className="muted">
            Numbers stay in this order no matter how the clips play — currently{" "}
            {screenRanks.join(" → ")} down the screen.
          </span>
        </label>

        {settings.playOrder === "custom" ? (
          <div className="field custom-order-field">
            <span>Playback sequence</span>
            <ol className="custom-order-list">
              {orderedClips.map((c, i) => (
                <li key={c.id} className="custom-order-row">
                  <span className="custom-order-pos">{i + 1}</span>
                  <span className="custom-order-rank">#{c.rank}</span>
                  <span className="truncate">
                    {c.label || c.fileName || "empty slot"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move rank ${c.rank} earlier`}
                    disabled={i === 0}
                    onClick={() => moveInOrder(c.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move rank ${c.rank} later`}
                    disabled={i === orderedClips.length - 1}
                    onClick={() => moveInOrder(c.id, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn ghost small"
              onClick={shuffleCustomOrder}
            >
              <Shuffle size={14} /> Randomize
            </button>
            <p className="muted">
              Plays top to bottom. The numbers on screen keep their own order —
              each name just appears next to its number when that clip plays.
              Press Randomize again for a different shuffle.
            </p>
          </div>
        ) : null}

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

        <div className="field transition-sound-field">
          <label className="field check">
            <input
              type="checkbox"
              checked={settings.transitionSound?.enabled !== false}
              onChange={(e) =>
                updateSettings({
                  transitionSound: {
                    ...defaultTransitionSound(),
                    ...settings.transitionSound,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <span>Transition whoosh between clips</span>
          </label>
          {settings.transitionSound?.enabled !== false ? (
            <>
              <label className="field">
                <span>
                  Whoosh volume (
                  {Math.round((settings.transitionSound?.volume ?? 1) * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={settings.transitionSound?.volume ?? 1}
                  onChange={(e) =>
                    updateSettings({
                      transitionSound: {
                        ...defaultTransitionSound(),
                        ...settings.transitionSound,
                        volume: parseFloat(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>
                  Starts before the cut (
                  {(settings.transitionSound?.lead ?? 0.25).toFixed(2)}s)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.transitionSound?.lead ?? 0.25}
                  onChange={(e) =>
                    updateSettings({
                      transitionSound: {
                        ...defaultTransitionSound(),
                        ...settings.transitionSound,
                        lead: parseFloat(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <p className="muted">
                Plays as each clip hands off to the next. Set a clip&apos;s own
                whoosh level on its card — 0% skips it for that clip.
              </p>
            </>
          ) : null}
        </div>

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
            <option value="crop-fill">Black bars behind (letterbox)</option>
            <option value="blur-pad">Blurred background (letterbox)</option>
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

        <label className="field check">
          <input
            type="checkbox"
            checked={settings.inDepthRanking === true}
            onChange={(e) => updateSettings({ inDepthRanking: e.target.checked })}
          />
          <span>In Depth Ranking (long line while playing, score after)</span>
        </label>
        {settings.inDepthRanking ? (
          <p className="muted">
            The playing clip shows its long line and fades slightly so the video
            stays readable; once it&apos;s done it becomes “label - score”. Write
            both in <strong>Title &amp; ranks → Rank numbers</strong>.
          </p>
        ) : null}

        <label className="field">
          <span>
            Master clip volume ({Math.round(settings.clipVolume * 100)}%)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.clipVolume}
            onChange={(e) => updateSettings({ clipVolume: parseFloat(e.target.value) })}
          />
          <span className="muted">
            Clip sliders show 100% by default; real gain is quieter so imports aren&apos;t harsh.
          </span>
        </label>
      </div>

      <div className="music-block sticker-block">
        <div className="music-head">
          <Sparkles size={16} />
          <span>Subscribe sticker — {activeChannel?.name || "channel"}</span>
        </div>
        <p className="muted">
          Saved per channel. Switch Channel in the top bar to edit another channel&apos;s popup.
          Plays once on the timeline (default 20s), muted. Use a VP9 alpha WebM (Profounder{" "}
          <code>webm_transparent</code>).
        </p>
        {sticker.mediaUrl ? (
          <div className="music-ready">
            <video
              key={`${channelState.activeSlug}:${sticker.mediaUrl}`}
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
                onChange={(e) => updateSticker({ ...sticker, enabled: e.target.checked })}
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
                  updateSticker({ ...sticker, startAt: parseFloat(e.target.value) })
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
                  updateSticker({
                    ...sticker,
                    startAt: Math.max(0, parseFloat(e.target.value) || 0),
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
                  updateSticker({ ...sticker, scale: parseFloat(e.target.value) })
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
                  updateSticker({ ...sticker, speed: parseFloat(e.target.value) })
                }
              />
            </label>
            <p className="muted">
              {activeChannel?.name || "Channel"} · {sticker.fileName || "sticker.webm"}
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
                  updateSticker({
                    ...sticker,
                    enabled: false,
                    mediaId: null,
                    mediaUrl: null,
                    fileName: null,
                    hasAlpha: false,
                    duration: 0,
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
            <Upload size={14} />{" "}
            {stickerBusy
              ? "Uploading…"
              : `Upload for ${activeChannel?.name || "channel"}`}
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
          <span>Background music</span>
        </div>
        <p className="muted">
          Optional full-timeline bed from <code>music/</code> (loops under the whole video).
          For music on a single clip, set it in <strong>Trim &amp; crop</strong>. To skip this
          bed on a clip that already has music, check <strong>Skip look BGM</strong> on that
          clip card.
        </p>

        <div className="music-folder-head">
          <strong>Folder (music/)</strong>
          <button
            type="button"
            className="btn ghost small"
            disabled={musicFolderBusy}
            onClick={() => void refreshMusicFolder({ autoPick: false })}
          >
            <RefreshCw size={14} className={musicFolderBusy ? "spin" : undefined} />
            Refresh
          </button>
        </div>
        <label className="field check">
          <input
            type="checkbox"
            checked={musicAuto}
            onChange={(e) => {
              const on = e.target.checked;
              updateSettings({ musicAutoFromFolder: on });
              // Only pick a bed when the user turns auto-pick ON
              if (on && !settings.musicMediaId && musicFolder.length > 0) {
                selectFolderBed(musicFolder[0]);
              }
            }}
          />
          <span>Auto-pick from folder when none selected (off by default)</span>
        </label>
        {musicFolder.length > 0 ? (
          <ul className="music-folder-list">
            {musicFolder.map((item) => {
              const active = settings.musicMediaId === item.mediaId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`music-folder-item ${active ? "active" : ""}`}
                    onClick={() => selectFolderBed(item)}
                  >
                    <span className="truncate">{item.fileName}</span>
                    <span className="muted">
                      {item.duration > 0 ? `${item.duration.toFixed(1)}s` : "—"}
                      {active ? " · selected" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">
            No beds yet. Add <code>.mp3</code>/<code>.wav</code> files to <code>music/</code>{" "}
            then Refresh.
          </p>
        )}

        {settings.musicUrl ? (
          <div className="music-ready">
            <audio key={settings.musicUrl} src={settings.musicUrl} controls />
            <label className="field">
              <span>Music volume ({Math.round((settings.musicVolume ?? 0.35) * 100)}%)</span>
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
            <div className="sticker-actions">
              <button
                className="btn ghost small"
                onClick={() => musicRef.current?.click()}
              >
                <Upload size={14} /> Upload instead
              </button>
              <button
                className="btn ghost small"
                onClick={() =>
                  updateSettings({
                    musicMediaId: null,
                    musicUrl: null,
                    musicAutoFromFolder: false,
                  })
                }
              >
                Clear music
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost small" onClick={() => musicRef.current?.click()}>
            <Upload size={14} /> Upload audio / video bed
          </button>
        )}
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
      </div>
    </section>
  );
}
