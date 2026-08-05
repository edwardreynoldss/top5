"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Play, Plus, Search, Star, Volume2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatTime, effectiveSfxVolume } from "@/lib/defaults";
import { loadSfxLibrary, playSfxPreview, stopSfxPreview } from "@/lib/sfxLibrary";
import {
  loadSfxFavoriteIds,
  sortSfxWithFavorites,
  toggleSfxFavorite,
} from "@/lib/sfxFavorites";
import type { SfxAsset } from "@/lib/types";

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
  } = useEditor();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [folderItems, setFolderItems] = useState<SfxAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [hitVolume, setHitVolume] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [favoriteTick, setFavoriteTick] = useState(0);

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
    for (const a of project.sfxAssets || []) byKey.set(a.mediaId || a.id, a);
    for (const a of folderItems) {
      if (!byKey.has(a.mediaId || a.id)) byKey.set(a.mediaId || a.id, a);
    }
    for (const a of library) {
      if (!byKey.has(a.mediaId || a.id)) byKey.set(a.mediaId || a.id, a);
    }
    return sortSfxWithFavorites(Array.from(byKey.values()), favoriteIds);
  }, [project.sfxAssets, folderItems, favoriteIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return sortSfxWithFavorites(
      catalog.filter((a) => a.fileName.toLowerCase().includes(q)),
      favoriteIds
    );
  }, [catalog, query, favoriteIds]);

  const selected = catalog.find((a) => a.id === selectedId) || null;

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
            fileName: pref?.fileName?.trim() || it.fileName,
            duration: it.duration > 0 ? it.duration : 0,
            volume: pref?.volume ?? 1,
          };
        }
      );
      setFolderItems(items);
      if (!selectedId && items[0]) setSelectedId(items[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load SFX");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHitVolume(1);
    setError(null);
    setPlacing(false);
    void refreshFolder();
    // Prefer an already-in-project asset
    const first = project.sfxAssets?.[0];
    if (first) setSelectedId(first.id);
  }, [open, refreshFolder, project.sfxAssets]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      stopSfxPreview();
    };
  }, [open]);

  async function previewAsset(asset: SfxAsset) {
    setError(null);
    stopSfxPreview();
    try {
      await playSfxPreview({
        asset,
        volume: effectiveSfxVolume(asset.volume, hitVolume),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview");
    }
  }

  function placeSelected() {
    if (!selected || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const dur = selected.duration > 0 ? selected.duration : 1;
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
        trimStart: 0,
        trimEnd: dur,
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
        className="modal-card wide add-sfx-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Add SFX at {formatTime(atTime)}</h3>
            <p className="muted">
              Pick a sound — it will fire at the paused preview time (
              {atTime.toFixed(2)}s). Trim and fine-tune in the SFX tab after placing.
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
          <label className="field inline-field">
            <span>
              <Volume2 size={14} className="muted-icon" /> Hit volume (
              {Math.round(hitVolume * 100)}%)
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={hitVolume}
              onChange={(e) => setHitVolume(parseFloat(e.target.value) || 0)}
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
                const active = a.id === selectedId;
                const fav = Boolean(a.mediaId && favoriteIds.has(a.mediaId));
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`add-sfx-row ${active ? "active" : ""}`}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <span className="add-sfx-row-meta">
                        <strong className="truncate">
                          {fav ? "★ " : ""}
                          {a.fileName}
                        </strong>
                        <span className="muted">
                          {a.duration > 0 ? formatTime(a.duration) : "…"}
                          {fav ? " · favorite" : ""}
                        </span>
                      </span>
                      <span className="add-sfx-row-actions">
                        <span
                          className={`icon-btn sfx-fav-btn ${fav ? "favorited" : ""}`}
                          role="button"
                          tabIndex={0}
                          title={fav ? "Remove from favorites" : "Favorite — pin to top"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!a.mediaId) return;
                            toggleSfxFavorite(a.mediaId);
                            setFavoriteTick((n) => n + 1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!a.mediaId) return;
                              toggleSfxFavorite(a.mediaId);
                              setFavoriteTick((n) => n + 1);
                            }
                          }}
                        >
                          <Star size={14} fill={fav ? "currentColor" : "none"} />
                        </span>
                        <span
                          className="btn ghost small"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            void previewAsset(a);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              void previewAsset(a);
                            }
                          }}
                        >
                          <Play size={14} />
                          Preview
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal-actions sticky-actions">
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
