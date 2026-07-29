"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Plus,
  Trash2,
  Dices,
  Play,
  Loader2,
  Volume2,
  Pencil,
  Search,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  clipTimelineOffsets,
  formatTime,
  totalTimelineDuration,
  resolveSfxStartAt,
  getPlaybackOrder,
  effectiveSfxVolume,
} from "@/lib/defaults";
import {
  cacheSfxFile,
  forgetSfxLocal,
  loadSfxLibrary,
  upsertSfxLibraryAsset,
} from "@/lib/sfxLibrary";
import type { SfxAsset } from "@/lib/types";

export function SfxPanel() {
  const {
    project,
    addSfxAsset,
    updateSfxAsset,
    removeSfxAsset,
    addSfxPlacement,
    updateSfxPlacement,
    removeSfxPlacement,
    selectedSfxPlacementId,
    setSelectedSfxPlacementId,
  } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryTick, setLibraryTick] = useState(0);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [volumeOpenId, setVolumeOpenId] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<SfxAsset[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderPath, setFolderPath] = useState("sfx/");
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const assets = useMemo(() => project.sfxAssets || [], [project.sfxAssets]);
  const placements = useMemo(() => project.sfxPlacements || [], [project.sfxPlacements]);
  const library = useMemo(() => {
    void libraryTick;
    return loadSfxLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryTick, assets]);

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

  const q = query.trim().toLowerCase();
  const filteredAssets = useMemo(
    () =>
      assets
        .filter((a) => !q || a.fileName.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => a.fileName.localeCompare(b.fileName)),
    [assets, q]
  );
  const unusedLibrary = useMemo(
    () =>
      library
        .filter((a) => !assets.some((x) => x.id === a.id))
        .filter((a) => !a.mediaId.startsWith("drop__"))
        .filter((a) => !q || a.fileName.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => a.fileName.localeCompare(b.fileName)),
    [library, assets, q]
  );

  const filteredFolder = useMemo(
    () =>
      folderItems
        .filter((a) => !assets.some((x) => x.id === a.id || x.mediaId === a.mediaId))
        .filter((a) => !q || a.fileName.toLowerCase().includes(q)),
    [folderItems, assets, q]
  );

  async function refreshFolder(silent = false) {
    if (!silent) setFolderLoading(true);
    try {
      const res = await fetch("/api/sfx/library", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read sfx folder");
      const prefs = loadSfxLibrary();
      const items: SfxAsset[] = (data.items || []).map(
        (it: {
          id: string;
          fileName: string;
          mediaId: string;
          mediaUrl: string;
          duration: number;
        }) => {
          const pref = prefs.find((p) => p.id === it.id || p.mediaId === it.mediaId);
          return {
            id: it.id,
            mediaId: it.mediaId,
            mediaUrl: it.mediaUrl,
            fileName: pref?.fileName?.trim() || it.fileName,
            duration: it.duration || 0.5,
            volume: pref?.volume ?? 1,
          };
        }
      );
      setFolderItems(items);
      if (typeof data.folder === "string" && data.folder) {
        const parts = data.folder.replace(/\\/g, "/").split("/");
        setFolderPath(parts.slice(-2).join("/") || "sfx/");
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Could not read sfx folder");
    } finally {
      if (!silent) setFolderLoading(false);
    }
  }

  useEffect(() => {
    void refreshFolder(true);
  }, []);

  useEffect(() => {
    if (!selectedSfxPlacementId) return;
    // Only scroll within placements list — don't yank the library scroller
    const el = selectedRef.current;
    if (!el) return;
    const parent = el.closest(".sfx-placements");
    if (parent) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedSfxPlacementId]);

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
        volume: 1,
      });
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

  function startRename(asset: SfxAsset) {
    setVolumeOpenId(null);
    setRenamingId(asset.id);
    setRenameValue(asset.fileName);
  }

  function commitRename(assetId: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    if (assets.some((a) => a.id === assetId)) {
      updateSfxAsset(assetId, { fileName: name });
      return;
    }
    if (folderItems.some((a) => a.id === assetId)) {
      setFolderItems((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, fileName: name } : a))
      );
      const item = folderItems.find((a) => a.id === assetId);
      if (item) upsertSfxLibraryAsset({ ...item, fileName: name });
      return;
    }
    const libItem = library.find((a) => a.id === assetId);
    if (libItem) {
      upsertSfxLibraryAsset({ ...libItem, fileName: name });
      setLibraryTick((n) => n + 1);
    }
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

  async function previewAsset(asset: SfxAsset) {
    setError(null);
    previewRef.current?.pause();
    if (!asset.mediaUrl) {
      setError("No audio URL for this sample.");
      return;
    }
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = asset.mediaUrl;
    previewRef.current = audio;
    audio.volume = Math.min(1, Math.max(0, asset.volume ?? 1));
    try {
      await audio.play();
    } catch {
      setError("Could not preview — click Play again after clicking anywhere on the page.");
    }
  }

  async function previewPlacement(placementId: string) {
    const p = placements.find((x) => x.id === placementId);
    const asset = assets.find((a) => a.id === p?.assetId);
    if (!p || !asset) return;
    setError(null);
    previewRef.current?.pause();
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = asset.mediaUrl;
    previewRef.current = audio;
    try {
      audio.currentTime = p.trimStart;
    } catch {
      // ignore
    }
    audio.volume = Math.min(
      1,
      Math.max(0, effectiveSfxVolume(asset.volume, p.volume))
    );
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
      setError("Could not preview — click Play again after clicking anywhere on the page.");
    }
  }

  function setAssetVolume(assetId: string, volume: number) {
    const vol = Math.max(0, Math.min(2, volume));
    if (assets.some((a) => a.id === assetId)) {
      updateSfxAsset(assetId, { volume: vol });
      return;
    }
    if (folderItems.some((a) => a.id === assetId)) {
      setFolderItems((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, volume: vol } : a))
      );
      // Persist volume preference for folder samples in the browser library
      const item = folderItems.find((a) => a.id === assetId);
      if (item) upsertSfxLibraryAsset({ ...item, volume: vol });
      return;
    }
    const libItem = library.find((a) => a.id === assetId);
    if (libItem) {
      upsertSfxLibraryAsset({ ...libItem, volume: vol });
      setLibraryTick((n) => n + 1);
    }
  }

  function renderAssetRow(
    a: SfxAsset,
    mode: "project" | "library" | "folder"
  ) {
    const renaming = renamingId === a.id;
    const volumeOpen = volumeOpenId === a.id;
    const sampleVol = typeof a.volume === "number" ? a.volume : 1;
    const modeLabel =
      mode === "project" ? "in project" : mode === "folder" ? "folder" : "library";
    return (
      <div key={a.id} className={`sfx-asset-block ${volumeOpen ? "volume-open" : ""}`}>
        <div className="sfx-asset-row">
          <div className="sfx-asset-meta">
            {renaming ? (
              <input
                className="input sfx-rename-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="truncate" title={a.fileName}>
                {a.fileName}
              </p>
            )}
            <p className="muted">
              {a.duration > 0 ? formatTime(a.duration) : "…"}
              {` · ${modeLabel}`}
              {sampleVol !== 1 ? ` · ${(sampleVol * 100).toFixed(0)}%` : ""}
            </p>
          </div>
          <div className="sfx-asset-actions">
            <button
              className="icon-btn"
              type="button"
              title="Preview sample"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void previewAsset(a);
              }}
            >
              <Play size={14} />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="Rename"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startRename(a);
              }}
            >
              <Pencil size={14} />
            </button>
            {(mode === "library" || mode === "folder") && (
              <button
                className="btn ghost small"
                type="button"
                onClick={() => addFromLibrary(a)}
              >
                Use
              </button>
            )}
            <button
              className={`icon-btn ${volumeOpen ? "active" : ""}`}
              type="button"
              title="Overall sample volume"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setVolumeOpenId((id) => (id === a.id ? null : a.id))}
            >
              <Volume2 size={14} />
            </button>
            {mode !== "folder" && (
              <button
                className="icon-btn danger"
                type="button"
                title={mode === "project" ? "Remove from project" : "Delete from library"}
                onClick={() => {
                  if (mode === "project") removeSfxAsset(a.id);
                  else {
                    void forgetSfxLocal(a.id, a.mediaId).then(() =>
                      setLibraryTick((n) => n + 1)
                    );
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {volumeOpen && (
          <label className="sfx-asset-volume">
            <span>Overall volume {(sampleVol * 100).toFixed(0)}%</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={sampleVol}
              onChange={(e) => setAssetVolume(a.id, parseFloat(e.target.value))}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <section className="panel tab-panel">
      <div className="panel-header compact">
        <h2>Sound effects</h2>
        <p className="muted">
          Drop files into the project <code>sfx/</code> folder, or upload here. Preview plays
          hits in the middle viewer.
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
        <button
          className="btn ghost small"
          type="button"
          disabled={folderLoading}
          onClick={() => void refreshFolder()}
          title="Re-scan the sfx/ folder"
        >
          {folderLoading ? <Loader2 size={14} className="spin" /> : null}
          Refresh folder
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <label className="sfx-search">
        <Search size={14} />
        <input
          className="input"
          placeholder="Search sound effects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="sfx-library-scroll" tabIndex={0}>
        <div className="sfx-library">
          <p className="field-label">
            Folder ({folderPath}) · {filteredFolder.length}
            {folderItems.length !== filteredFolder.length
              ? ` shown / ${folderItems.length} total`
              : " files"}
            {q ? " matching" : ""}
          </p>
          <p className="muted sfx-folder-hint">
            Drop audio into <code>sfx/</code>, then Refresh. Use ▶ to preview, pencil to rename.
          </p>
          {folderLoading && folderItems.length === 0 ? (
            <p className="muted">Scanning folder…</p>
          ) : filteredFolder.length === 0 ? (
            <p className="muted">
              {q
                ? "No folder files match that search."
                : "Empty — add .mp3 / .wav / .m4a files to sfx/"}
            </p>
          ) : (
            filteredFolder.map((a) => renderAssetRow(a, "folder"))
          )}
        </div>

        {filteredAssets.length > 0 && (
          <div className="sfx-library">
            <p className="field-label">
              In this project ({filteredAssets.length}
              {q ? ` matching` : ""})
            </p>
            {filteredAssets.map((a) => renderAssetRow(a, "project"))}
          </div>
        )}

        {unusedLibrary.length > 0 && (
          <div className="sfx-library">
            <p className="field-label">
              Saved library ({unusedLibrary.length}
              {q ? ` matching` : ""})
            </p>
            {unusedLibrary.map((a) => renderAssetRow(a, "library"))}
          </div>
        )}
      </div>

      {totalDur > 0 && placements.length > 0 && (
        <div className="sfx-timeline" aria-hidden>
          <div className="sfx-timeline-track">
            {placements.map((p, idx) => {
              const abs = resolveSfxStartAt(p, offsets);
              const left = Math.min(100, Math.max(0, (abs / totalDur) * 100));
              return (
                <span
                  key={p.id}
                  className={`sfx-timeline-mark ${p.id === selectedSfxPlacementId ? "active" : ""}`}
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

      <div className="sfx-placements">
        <p className="field-label">
          Hits on timeline {totalDur > 0 ? `(video ${totalDur.toFixed(1)}s)` : ""}
        </p>
        {placements.length === 0 && (
          <p className="muted">
            Use <strong>Add at …</strong> under the middle preview, or place manually below.
          </p>
        )}
        {placements.map((p, idx) => {
          const asset = assets.find((a) => a.id === p.assetId);
          const abs = resolveSfxStartAt(p, offsets);
          const maxTrim = asset?.duration || p.trimEnd || 1;
          const selected = p.id === selectedSfxPlacementId;
          return (
            <div
              key={p.id}
              ref={selected ? selectedRef : undefined}
              className={`sfx-placement ${selected ? "selected" : ""}`}
              onClick={() => setSelectedSfxPlacementId(p.id)}
            >
              <div className="sfx-placement-head">
                <strong>Hit {idx + 1}</strong>
                <span className="muted">@ {abs.toFixed(2)}s</span>
                <div className="clip-actions">
                  <button
                    className="icon-btn"
                    type="button"
                    title="Preview trimmed sample"
                    onClick={(e) => {
                      e.stopPropagation();
                      void previewPlacement(p.id);
                    }}
                  >
                    <Play size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Randomize position on full timeline"
                    onClick={(e) => {
                      e.stopPropagation();
                      randomize(p.id);
                    }}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSfxPlacement(p.id);
                    }}
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
                      step={0.01}
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
                      step={0.01}
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
                  <span>Hit volume {(p.volume * 100).toFixed(0)}%</span>
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
                {abs.toFixed(2)}s · effective{" "}
                {(effectiveSfxVolume(asset?.volume, p.volume) * 100).toFixed(0)}%
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
