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
  Star,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  clipTimelineOffsets,
  formatTime,
  totalTimelineDuration,
  resolveSfxStartAt,
  getPlaybackOrder,
  effectiveSfxVolume,
  sfxUiVolume,
} from "@/lib/defaults";
import {
  cacheSfxFile,
  forgetSfxLocal,
  loadSfxLibrary,
  playSfxPreview,
  stopSfxPreview,
  upsertSfxLibraryAsset,
} from "@/lib/sfxLibrary";
import {
  loadSfxFavoriteIds,
  sortSfxWithFavorites,
  toggleSfxFavorite,
} from "@/lib/sfxFavorites";
import { RangeRail } from "@/components/RangeRail";
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
  const [favoriteTick, setFavoriteTick] = useState(0);

  const assets = useMemo(() => project.sfxAssets || [], [project.sfxAssets]);
  const placements = useMemo(() => project.sfxPlacements || [], [project.sfxPlacements]);
  const library = useMemo(() => {
    void libraryTick;
    return loadSfxLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryTick, assets]);
  const favoriteIds = useMemo(() => {
    void favoriteTick;
    return loadSfxFavoriteIds();
  }, [favoriteTick]);

  const readyClips = useMemo(
    () => getPlaybackOrder(project.clips, project.settings),
    [project.clips, project.settings.playOrder, project.settings.customOrder]
  );
  const offsets = useMemo(
    () => clipTimelineOffsets(project.clips, project.settings),
    [project.clips, project.settings.playOrder, project.settings.customOrder]
  );
  const totalDur = useMemo(
    () => totalTimelineDuration(project.clips, project.settings),
    [project.clips, project.settings.playOrder, project.settings.customOrder]
  );

  const q = query.trim().toLowerCase();
  const filteredAssets = useMemo(
    () =>
      sortSfxWithFavorites(
        assets.filter((a) => !q || a.fileName.toLowerCase().includes(q)),
        favoriteIds
      ),
    [assets, q, favoriteIds]
  );
  const unusedLibrary = useMemo(
    () =>
      sortSfxWithFavorites(
        library
          .filter((a) => !assets.some((x) => x.id === a.id))
          .filter((a) => !a.mediaId.startsWith("drop__"))
          .filter((a) => !q || a.fileName.toLowerCase().includes(q)),
        favoriteIds
      ),
    [library, assets, q, favoriteIds]
  );

  const filteredFolder = useMemo(
    () =>
      sortSfxWithFavorites(
        folderItems
          .filter((a) => !assets.some((x) => x.id === a.id || x.mediaId === a.mediaId))
          .filter((a) => !q || a.fileName.toLowerCase().includes(q)),
        favoriteIds
      ),
    [folderItems, assets, q, favoriteIds]
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
            duration: it.duration > 0 ? it.duration : 0,
            volume: pref?.volume ?? 1,
          };
        }
      );
      setFolderItems(items);

      // Heal assets/placements stuck on the old fake 0.5s (or any shorter probed length)
      for (const it of items) {
        if (!(it.duration > 0.05)) continue;
        const existing = project.sfxAssets.find(
          (a) => a.id === it.id || a.mediaId === it.mediaId
        );
        if (!existing) continue;
        const oldDur = existing.duration || 0;
        if (Math.abs(oldDur - it.duration) < 0.04) continue;
        updateSfxAsset(existing.id, { duration: it.duration, mediaUrl: it.mediaUrl });
        for (const p of project.sfxPlacements || []) {
          if (p.assetId !== existing.id) continue;
          // Expand hits that used the full (wrong) old length or the classic 0.5 fake
          const usedFullOld =
            Math.abs(p.trimEnd - oldDur) < 0.06 ||
            (oldDur > 0 && oldDur <= 0.55 && p.trimEnd <= 0.55);
          if (usedFullOld && p.trimEnd < it.duration - 0.04) {
            updateSfxPlacement(p.id, { trimEnd: it.duration });
          }
        }
      }

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
        trimEnd: data.duration > 0 ? data.duration : 1,
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
    const dur = asset.duration > 0 ? asset.duration : 1;
    addSfxPlacement({
      assetId: asset.id,
      startAt: 0,
      clipId: null,
      offsetInClip: 0,
      trimStart: 0,
      trimEnd: dur,
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
    stopSfxPreview();
    try {
      await playSfxPreview({
        asset,
        volume: effectiveSfxVolume(asset.volume, 1),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview");
    }
  }

  async function previewPlacement(placementId: string) {
    const p = placements.find((x) => x.id === placementId);
    const asset = assets.find((a) => a.id === p?.assetId);
    if (!p || !asset) return;
    setError(null);
    stopSfxPreview();
    try {
      await playSfxPreview({
        asset,
        volume: effectiveSfxVolume(asset.volume, p.volume),
        startAt: p.trimStart,
        stopAt: p.trimEnd,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview");
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

  function toggleFavorite(mediaId: string) {
    if (!mediaId) return;
    toggleSfxFavorite(mediaId);
    setFavoriteTick((n) => n + 1);
  }

  function renderAssetRow(
    a: SfxAsset,
    mode: "project" | "library" | "folder"
  ) {
    const renaming = renamingId === a.id;
    const volumeOpen = volumeOpenId === a.id;
    const sampleVol = typeof a.volume === "number" ? a.volume : 1;
    const fav = Boolean(a.mediaId && favoriteIds.has(a.mediaId));
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
                {fav ? "★ " : ""}
                {a.fileName}
              </p>
            )}
            <p className="muted">
              {a.duration > 0 ? formatTime(a.duration) : "…"}
              {` · ${modeLabel}`}
              {fav ? " · favorite" : ""}
              {sampleVol !== 1 ? ` · ${(sampleVol * 100).toFixed(0)}%` : ""}
            </p>
          </div>
          <div className="sfx-asset-actions">
            <button
              className={`icon-btn sfx-fav-btn ${fav ? "favorited" : ""}`}
              type="button"
              title={fav ? "Remove from favorites" : "Favorite — pin to top"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (a.mediaId) toggleFavorite(a.mediaId);
              }}
            >
              <Star size={14} fill={fav ? "currentColor" : "none"} />
            </button>
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
          hits in the middle viewer. Volume sliders stay at 100% by default — playback uses the
          same quieter real gain as clip audio.
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
            Drop audio into <code>sfx/</code>, then Refresh. Star favorites to keep them on top.
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

              <div className="sfx-placement-trim">
                <RangeRail
                  min={0}
                  max={maxTrim}
                  start={p.trimStart}
                  end={Math.min(p.trimEnd, maxTrim)}
                  minSpan={0.05}
                  ariaLabel={`Trim for hit ${idx + 1}`}
                  formatValue={(v) => formatTime(v)}
                  onChange={({ start, end }) =>
                    updateSfxPlacement(p.id, {
                      trimStart: start,
                      trimEnd: end,
                    })
                  }
                />
                <label className="field">
                  <span>Hit volume {(p.volume * 100).toFixed(0)}%</span>
                  <input
                    className="slider-inline"
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
                {abs.toFixed(2)}s · volume{" "}
                {(sfxUiVolume(asset?.volume, p.volume) * 100).toFixed(0)}%
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
