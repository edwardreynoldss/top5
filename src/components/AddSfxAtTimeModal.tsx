"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatTime, effectiveSfxVolume } from "@/lib/defaults";
import {
  folderSfxFileName,
  forgetSfxLocal,
  isFolderSfx,
  loadSfxLibrary,
  playSfxPreview,
  remapSfxLibraryMedia,
  sameSfxAsset,
  sfxAssetKey,
  stopSfxPreview,
  upsertSfxLibraryAsset,
} from "@/lib/sfxLibrary";
import {
  loadSfxFavoriteIds,
  removeSfxFavorite,
  renameSfxFavorite,
  sortSfxWithFavorites,
  toggleSfxFavorite,
} from "@/lib/sfxFavorites";
import { deleteFolderSfx, renameFolderSfx } from "@/lib/sfxFolderApi";
import { RangeRail } from "@/components/RangeRail";
import type { SfxAsset } from "@/lib/types";

function sampleDuration(asset: SfxAsset | null) {
  if (!asset) return 1;
  return asset.duration > 0.05 ? asset.duration : 1;
}

function displayName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

export function AddSfxAtTimeModal({
  open,
  atTime,
  onClose,
}: {
  open: boolean;
  /** Absolute timeline seconds where the hit should fire */
  atTime: number;
  onClose: () => void;
}) {
  const {
    project,
    placeSfxHit,
    setSelectedSfxPlacementId,
    requestSfxTab,
    remapSfxMedia,
    updateSfxAsset,
    removeSfxAsset,
  } = useEditor();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [folderItems, setFolderItems] = useState<SfxAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [hitVolume, setHitVolume] = useState(1);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [trimOpen, setTrimOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [favoriteTick, setFavoriteTick] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const favoriteIds = useMemo(() => {
    void favoriteTick;
    return loadSfxFavoriteIds();
  }, [favoriteTick]);

  const catalog = useMemo(() => {
    const library = loadSfxLibrary();
    const byKey = new Map<string, SfxAsset>();
    const absorb = (a: SfxAsset) => {
      const key = sfxAssetKey(a);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, a);
        return;
      }
      byKey.set(key, {
        ...prev,
        ...a,
        id: prev.id,
        mediaId: prev.mediaId || a.mediaId,
        mediaUrl: a.mediaUrl || prev.mediaUrl,
        fileName: a.fileName || prev.fileName,
        duration: a.duration > 0 ? a.duration : prev.duration,
        volume: a.volume ?? prev.volume,
      });
    };
    for (const a of library) absorb(a);
    for (const a of project.sfxAssets || []) absorb(a);
    for (const a of folderItems) absorb(a);
    return sortSfxWithFavorites(Array.from(byKey.values()), favoriteIds);
  }, [project.sfxAssets, folderItems, favoriteIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return sortSfxWithFavorites(
      catalog.filter(
        (a) =>
          a.fileName.toLowerCase().includes(q) ||
          displayName(a.fileName).toLowerCase().includes(q)
      ),
      favoriteIds
    );
  }, [catalog, query, favoriteIds]);

  const selected = catalog.find((a) => sameSfxAsset(a, selectedId)) || null;
  const maxDur = sampleDuration(selected);
  const usedLen = Math.max(0.05, trimEnd - trimStart);
  const trimmed = Boolean(selected) && (trimStart > 0.02 || usedLen < maxDur - 0.02);

  const refreshFolder = useCallback(async () => {
    setLoading(true);
    setError(null);
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
            fileName: it.fileName,
            duration: it.duration > 0 ? it.duration : 0,
            volume: pref?.volume ?? 1,
          };
        }
      );
      setFolderItems(items);
      setSelectedId((cur) => {
        if (cur && items.some((it) => sameSfxAsset(it, cur))) return cur;
        return cur || items[0]?.id || "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load SFX");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHitVolume(1);
    setError(null);
    setPlacing(false);
    setPreviewing(false);
    setSelectedId("");
    setRenamingId(null);
    setTrimOpen(false);
    void refreshFolder();
  }, [open, refreshFolder]);

  useEffect(() => {
    if (!open) return;
    setSelectedId((cur) => {
      if (cur && catalog.some((a) => sameSfxAsset(a, cur))) return cur;
      return catalog[0]?.id || "";
    });
  }, [open, catalog]);

  useEffect(() => {
    if (!selected) return;
    const dur = sampleDuration(selected);
    setTrimStart(0);
    setTrimEnd(dur);
    setTrimOpen(false);
  }, [selected?.id, selected?.duration]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      stopSfxPreview();
    };
  }, [open]);

  function clampTrim(start: number, end: number) {
    const max = sampleDuration(selected);
    const s = Math.max(0, Math.min(start, max - 0.05));
    const e = Math.max(s + 0.05, Math.min(end, max));
    return { start: s, end: e };
  }

  async function previewTrimmed(asset: SfxAsset, start: number, end: number) {
    setError(null);
    setPreviewing(true);
    stopSfxPreview();
    try {
      const max = sampleDuration(asset);
      const s = Math.max(0, Math.min(start, max - 0.05));
      const e = Math.max(s + 0.05, Math.min(end, max));
      await playSfxPreview({
        asset,
        volume: effectiveSfxVolume(asset.volume, hitVolume),
        startAt: s,
        stopAt: e,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview");
    } finally {
      setPreviewing(false);
    }
  }

  function selectAsset(asset: SfxAsset) {
    if (renamingId) return;
    setSelectedId(asset.id);
  }

  function startRename(asset: SfxAsset) {
    setRenamingId(sfxAssetKey(asset));
    setRenameValue(displayName(asset.fileName));
  }

  async function commitRename(asset: SfxAsset) {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next || next === displayName(asset.fileName)) return;
    const key = sfxAssetKey(asset);
    setBusyId(key);
    setError(null);
    try {
      if (isFolderSfx(asset)) {
        const from =
          folderSfxFileName(asset.mediaId) || asset.fileName;
        const result = await renameFolderSfx(from, next);
        const updated: SfxAsset = {
          ...asset,
          id: result.mediaId,
          mediaId: result.mediaId,
          mediaUrl: result.mediaUrl,
          fileName: result.fileName,
        };
        setFolderItems((prev) =>
          prev.map((a) =>
            sameSfxAsset(a, asset.id) || sameSfxAsset(a, asset.mediaId)
              ? updated
              : a
          )
        );
        remapSfxLibraryMedia(asset.mediaId, updated);
        renameSfxFavorite(asset.mediaId, result.mediaId);
        remapSfxMedia(asset.mediaId, {
          mediaId: result.mediaId,
          mediaUrl: result.mediaUrl,
          fileName: result.fileName,
        });
        setSelectedId(result.mediaId);
        setFavoriteTick((n) => n + 1);
      } else {
        const name = next.includes(".") ? next : `${next}${asset.fileName.match(/\.[^.]+$/)?.[0] || ""}`;
        if (project.sfxAssets?.some((a) => sameSfxAsset(a, asset.id))) {
          updateSfxAsset(asset.id, { fileName: name });
        } else {
          upsertSfxLibraryAsset({ ...asset, fileName: name });
        }
        setFolderItems((prev) =>
          prev.map((a) => (sameSfxAsset(a, asset.id) ? { ...a, fileName: name } : a))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAsset(asset: SfxAsset) {
    const label = asset.fileName;
    const folder = isFolderSfx(asset);
    const ok = window.confirm(
      folder
        ? `Delete “${label}” from the sfx folder? This cannot be undone.`
        : `Remove “${label}” from this list?`
    );
    if (!ok) return;
    const key = sfxAssetKey(asset);
    setBusyId(key);
    setError(null);
    try {
      if (folder) {
        const from = folderSfxFileName(asset.mediaId) || asset.fileName;
        await deleteFolderSfx(from);
        setFolderItems((prev) =>
          prev.filter((a) => !sameSfxAsset(a, asset.id) && !sameSfxAsset(a, asset.mediaId))
        );
        for (const a of project.sfxAssets || []) {
          if (sameSfxAsset(a, asset.id) || sameSfxAsset(a, asset.mediaId)) {
            removeSfxAsset(a.id);
          }
        }
        await forgetSfxLocal(asset.id, asset.mediaId);
        removeSfxFavorite(asset.mediaId);
        setFavoriteTick((n) => n + 1);
      } else if ((project.sfxAssets || []).some((a) => sameSfxAsset(a, asset.id))) {
        removeSfxAsset(asset.id);
      } else {
        await forgetSfxLocal(asset.id, asset.mediaId);
      }
      if (sameSfxAsset(asset, selectedId)) setSelectedId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  function placeSelected() {
    if (!selected || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const dur = sampleDuration(selected);
      const { start, end } = clampTrim(trimStart, trimEnd);
      const { placementId } = placeSfxHit({
        asset: {
          id: selected.id,
          mediaId: selected.mediaId,
          mediaUrl: selected.mediaUrl,
          fileName: selected.fileName,
          duration: dur,
          volume: selected.volume ?? 1,
        },
        startAt: Number(atTime.toFixed(2)),
        volume: hitVolume,
        trimStart: Number(start.toFixed(3)),
        trimEnd: Number(end.toFixed(3)),
      });
      setSelectedSfxPlacementId(placementId);
      requestSfxTab();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place SFX");
      setPlacing(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="modal-backdrop film-history-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card wide add-sfx-modal add-sfx-place-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Add SFX at {formatTime(atTime)}</h3>
            <p className="muted">
              Pick a sound from <code>sfx/</code>. Rename and delete edit the folder
              file. Place at {atTime.toFixed(2)}s.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="add-sfx-toolbar">
          <label className="field inline-field add-sfx-search">
            <Search size={14} className="muted-icon" />
            <input
              className="input"
              placeholder="Search sounds…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="add-sfx-list">
          {loading && filtered.length === 0 ? (
            <p className="muted center">
              <Loader2 size={14} className="spin inline" /> Loading sounds…
            </p>
          ) : filtered.length === 0 ? (
            <p className="muted center">
              No sounds yet. Drop files into <code>sfx/</code> or upload in the SFX tab.
            </p>
          ) : (
            <ul>
              {filtered.map((a) => {
                const active = sameSfxAsset(a, selectedId);
                const fav = Boolean(a.mediaId && favoriteIds.has(a.mediaId));
                const key = sfxAssetKey(a);
                const renaming = renamingId === key;
                const busy = busyId === key;
                return (
                  <li key={key}>
                    <div className={`add-sfx-row ${active ? "active" : ""}`}>
                      <button
                        type="button"
                        className="add-sfx-row-main"
                        onClick={() => selectAsset(a)}
                        disabled={renaming || busy}
                      >
                        <span className="add-sfx-row-meta">
                          {renaming ? (
                            <input
                              className="input sfx-rename-input"
                              value={renameValue}
                              autoFocus
                              disabled={busy}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => void commitRename(a)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setRenamingId(null);
                                }
                              }}
                            />
                          ) : (
                            <strong className="truncate" title={a.fileName}>
                              {fav ? "★ " : ""}
                              {displayName(a.fileName)}
                            </strong>
                          )}
                          <span className="muted">
                            {a.duration > 0 ? formatTime(a.duration) : "…"}
                            {isFolderSfx(a) ? " · folder" : ""}
                            {fav ? " · favorite" : ""}
                          </span>
                        </span>
                      </button>
                      <span className="add-sfx-row-actions">
                        <button
                          type="button"
                          className={`icon-btn sfx-fav-btn ${fav ? "favorited" : ""}`}
                          title={fav ? "Remove from favorites" : "Favorite — pin to top"}
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!a.mediaId) return;
                            toggleSfxFavorite(a.mediaId);
                            setFavoriteTick((n) => n + 1);
                          }}
                        >
                          <Star size={14} fill={fav ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Preview"
                          disabled={busy || previewing}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAsset(a);
                            void previewTrimmed(a, 0, sampleDuration(a));
                          }}
                        >
                          <Play size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Rename"
                          disabled={busy}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(a);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title={
                            isFolderSfx(a)
                              ? "Delete from sfx folder"
                              : "Remove from list"
                          }
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteAsset(a);
                          }}
                        >
                          {busy ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected ? (
          <div className={`add-sfx-trim ${trimOpen ? "" : "collapsed"}`}>
            <div className="add-sfx-trim-head">
              <strong className="truncate" title={selected.fileName}>
                {displayName(selected.fileName)}
              </strong>
              <span className="muted">
                {trimmed
                  ? `${usedLen.toFixed(2)}s of ${maxDur.toFixed(2)}s`
                  : `Full ${maxDur.toFixed(2)}s`}
              </span>
            </div>
            {trimOpen ? (
              <>
                <RangeRail
                  min={0}
                  max={maxDur}
                  start={trimStart}
                  end={trimEnd}
                  minSpan={0.05}
                  ariaLabel="SFX sample trim"
                  formatValue={(v) => formatTime(v)}
                  onChange={({ start, end }) => {
                    const { start: s, end: e } = clampTrim(start, end);
                    setTrimStart(s);
                    setTrimEnd(e);
                  }}
                />
                <div className="add-sfx-trim-actions">
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={previewing}
                    onClick={() => void previewTrimmed(selected, trimStart, trimEnd)}
                  >
                    {previewing ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    Preview this slice
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setTrimStart(0);
                      setTrimEnd(maxDur);
                    }}
                  >
                    Use full sample
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setTrimOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <div className="add-sfx-trim-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setTrimOpen(true)}
                >
                  Trim sample
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={previewing}
                  onClick={() =>
                    void previewTrimmed(selected, trimStart, trimEnd)
                  }
                >
                  {previewing ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Preview
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="modal-actions sticky-actions add-sfx-footer">
          <label className="field inline-field add-sfx-hit-vol">
            <span>
              <Volume2 size={14} className="muted-icon" />{" "}
              {Math.round(hitVolume * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={hitVolume}
              onChange={(e) => setHitVolume(parseFloat(e.target.value) || 0)}
              aria-label="Hit volume"
            />
          </label>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected || placing}
            onClick={placeSelected}
          >
            {placing ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            Place at {formatTime(atTime)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
