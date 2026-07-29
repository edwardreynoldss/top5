"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Plus,
  Trash2,
  Dices,
  Play,
  Loader2,
  Volume2,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  clipTimelineOffsets,
  formatTime,
  totalTimelineDuration,
  resolveSfxStartAt,
  getPlaybackOrder,
} from "@/lib/defaults";
import {
  cacheSfxFile,
  forgetSfxLocal,
  loadSfxLibrary,
} from "@/lib/sfxLibrary";
import type { SfxAsset } from "@/lib/types";

export function SfxPanel() {
  const {
    project,
    addSfxAsset,
    removeSfxAsset,
    addSfxPlacement,
    updateSfxPlacement,
    removeSfxPlacement,
  } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryTick, setLibraryTick] = useState(0);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const assets = project.sfxAssets || [];
  const placements = project.sfxPlacements || [];
  const library = useMemo(() => {
    void libraryTick;
    return loadSfxLibrary();
    // refresh when assets change or libraryTick bumps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryTick, assets.length]);
  const readyClips = useMemo(
    () => getPlaybackOrder(project.clips, project.settings.playOrder),
    [project.clips, project.settings.playOrder]
  );
  const offsets = useMemo(
    () => clipTimelineOffsets(project.clips, project.settings.playOrder),
    [project.clips, project.settings.playOrder]
  );
  const totalDur = useMemo(
    () => totalTimelineDuration(project.clips, project.settings.playOrder),
    [project.clips, project.settings.playOrder]
  );

  async function uploadSfx(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await cacheSfxFile(data.mediaId, file, data.fileName || file.name);
      const id = addSfxAsset({
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName || file.name,
        duration: data.duration || 1,
      });
      // Place on the whole timeline at 0s — can move anywhere
      addSfxPlacement({
        assetId: id,
        startAt: 0,
        clipId: null,
        offsetInClip: 0,
        trimStart: 0,
        trimEnd: Math.min(1.5, data.duration || 1.5),
        volume: 1,
      });
      setLibraryTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function addFromLibrary(asset: SfxAsset) {
    addSfxAsset(asset);
    addSfxPlacement({
      assetId: asset.id,
      startAt: 0,
      clipId: null,
      offsetInClip: 0,
      trimStart: 0,
      trimEnd: Math.min(1.5, asset.duration || 1.5),
      volume: 1,
    });
  }

  function randomize(id: string) {
    if (totalDur <= 0.2) return;
    updateSfxPlacement(id, {
      startAt: Math.random() * Math.max(0.1, totalDur - 0.1),
      clipId: null,
      offsetInClip: 0,
    });
  }

  function randomizeAll() {
    for (const p of placements) randomize(p.id);
  }

  async function previewPlacement(placementId: string) {
    const p = placements.find((x) => x.id === placementId);
    const asset = assets.find((a) => a.id === p?.assetId);
    if (!p || !asset) return;
    previewRef.current?.pause();
    const audio = new Audio(asset.mediaUrl);
    previewRef.current = audio;
    audio.currentTime = p.trimStart;
    audio.volume = Math.min(1, Math.max(0, p.volume));
    const stopAt = p.trimEnd;
    const onTime = () => {
      if (audio.currentTime >= stopAt - 0.03) {
        audio.pause();
        audio.removeEventListener("timeupdate", onTime);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    try {
      await audio.play();
    } catch {
      setError("Could not preview audio — click again after interacting with the page.");
    }
  }

  const unusedLibrary = library.filter((a) => !assets.some((x) => x.id === a.id));

  return (
    <section className="panel tab-panel">
      <div className="panel-header compact">
        <h2>Sound effects</h2>
        <p className="muted">
          Samples save in this browser. Place hits anywhere on the timeline.
        </p>
      </div>

      <div className="sfx-actions">
        <button
          className="btn ghost small"
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          Upload SFX
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.aac,.ogg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadSfx(f);
            e.target.value = "";
          }}
        />
        <button
          className="btn ghost small"
          type="button"
          disabled={assets.length === 0}
          onClick={() => addSfxPlacement({ clipId: null, startAt: 0 })}
        >
          <Plus size={14} /> Add hit
        </button>
        <button
          className="btn ghost small"
          type="button"
          disabled={placements.length === 0 || totalDur <= 0}
          onClick={randomizeAll}
          title="Scatter all hits to random times on the full timeline"
        >
          <Dices size={14} /> Randomize all
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {totalDur > 0 && placements.length > 0 && (
        <div className="sfx-timeline" aria-hidden>
          <div className="sfx-timeline-track">
            {placements.map((p, idx) => {
              const abs = resolveSfxStartAt(p, offsets);
              const left = Math.min(100, Math.max(0, (abs / totalDur) * 100));
              return (
                <span
                  key={p.id}
                  className="sfx-timeline-mark"
                  style={{ left: `${left}%` }}
                  title={`Hit ${idx + 1} @ ${abs.toFixed(2)}s`}
                />
              );
            })}
          </div>
          <div className="sfx-timeline-labels">
            <span>0:00</span>
            <span>{formatTime(totalDur)}</span>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div className="sfx-library">
          <p className="field-label">In this project</p>
          {assets.map((a) => (
            <div key={a.id} className="sfx-asset-row">
              <Volume2 size={14} className="muted-icon" />
              <div className="sfx-asset-meta">
                <p className="truncate">{a.fileName}</p>
                <p className="muted">{formatTime(a.duration)} · saved locally</p>
              </div>
              <button
                className="icon-btn danger"
                type="button"
                title="Remove from project (keeps local library)"
                onClick={() => removeSfxAsset(a.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {unusedLibrary.length > 0 && (
        <div className="sfx-library">
          <p className="field-label">Saved library (reuse)</p>
          {unusedLibrary.map((a) => (
            <div key={a.id} className="sfx-asset-row">
              <Volume2 size={14} className="muted-icon" />
              <div className="sfx-asset-meta">
                <p className="truncate">{a.fileName}</p>
                <p className="muted">{formatTime(a.duration)}</p>
              </div>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => addFromLibrary(a)}
              >
                Use
              </button>
              <button
                className="icon-btn danger"
                type="button"
                title="Delete from local library"
                onClick={() => {
                  void forgetSfxLocal(a.id, a.mediaId).then(() =>
                    setLibraryTick((n) => n + 1)
                  );
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sfx-placements">
        <p className="field-label">
          Hits on timeline {totalDur > 0 ? `(video ${totalDur.toFixed(1)}s)` : ""}
        </p>
        {placements.length === 0 && (
          <p className="muted">
            Upload a sound effect, then set Whole video timeline + start time to place it
            anywhere.
          </p>
        )}
        {placements.map((p, idx) => {
          const asset = assets.find((a) => a.id === p.assetId);
          const abs = resolveSfxStartAt(p, offsets);
          const maxTrim = asset?.duration || p.trimEnd || 1;
          return (
            <div key={p.id} className="sfx-placement">
              <div className="sfx-placement-head">
                <strong>Hit {idx + 1}</strong>
                <span className="muted">@ {abs.toFixed(2)}s</span>
                <div className="clip-actions">
                  <button
                    className="icon-btn"
                    type="button"
                    title="Preview trimmed sample"
                    onClick={() => void previewPlacement(p.id)}
                  >
                    <Play size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Randomize position on full timeline"
                    onClick={() => randomize(p.id)}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    type="button"
                    onClick={() => removeSfxPlacement(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <label className="field">
                <span>Sample</span>
                <select
                  className="input"
                  value={p.assetId}
                  onChange={(e) => {
                    const next = assets.find((a) => a.id === e.target.value);
                    updateSfxPlacement(p.id, {
                      assetId: e.target.value,
                      trimEnd: Math.min(p.trimEnd, next?.duration || p.trimEnd),
                    });
                  }}
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fileName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Place on</span>
                <select
                  className="input"
                  value={p.clipId || "__timeline__"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__timeline__") {
                      updateSfxPlacement(p.id, { clipId: null, startAt: abs });
                    } else {
                      updateSfxPlacement(p.id, { clipId: v, offsetInClip: 0 });
                    }
                  }}
                >
                  <option value="__timeline__">Whole video timeline (anywhere)</option>
                  {readyClips.map((c) => (
                    <option key={c.id} value={c.id}>
                      Rank #{c.rank} {c.label ? `· ${c.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {p.clipId ? (
                <label className="field">
                  <span>Offset in clip ({p.offsetInClip.toFixed(2)}s)</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(
                      0.1,
                      offsets.find((o) => o.clipId === p.clipId)?.duration || 10
                    )}
                    step={0.05}
                    value={p.offsetInClip}
                    onChange={(e) =>
                      updateSfxPlacement(p.id, { offsetInClip: parseFloat(e.target.value) })
                    }
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Start at ({p.startAt.toFixed(2)}s)</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, totalDur || 30)}
                      step={0.05}
                      value={p.startAt}
                      onChange={(e) =>
                        updateSfxPlacement(p.id, { startAt: parseFloat(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Exact time (seconds)</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={Math.max(0.1, totalDur || 600)}
                      step={0.05}
                      value={Number(p.startAt.toFixed(2))}
                      onChange={(e) =>
                        updateSfxPlacement(p.id, {
                          startAt: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                    />
                  </label>
                </>
              )}

              <div className="field-grid tight">
                <label className="field">
                  <span>Trim start {formatTime(p.trimStart)}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.05, p.trimEnd - 0.05)}
                    step={0.01}
                    value={p.trimStart}
                    onChange={(e) =>
                      updateSfxPlacement(p.id, { trimStart: parseFloat(e.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Trim end {formatTime(p.trimEnd)}</span>
                  <input
                    type="range"
                    min={p.trimStart + 0.05}
                    max={maxTrim}
                    step={0.01}
                    value={Math.min(p.trimEnd, maxTrim)}
                    onChange={(e) =>
                      updateSfxPlacement(p.id, { trimEnd: parseFloat(e.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Volume {(p.volume * 100).toFixed(0)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={p.volume}
                    onChange={(e) =>
                      updateSfxPlacement(p.id, { volume: parseFloat(e.target.value) })
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Uses {(Math.max(0, p.trimEnd - p.trimStart)).toFixed(2)}s of sample · plays at{" "}
                {abs.toFixed(2)}s in the final video
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
