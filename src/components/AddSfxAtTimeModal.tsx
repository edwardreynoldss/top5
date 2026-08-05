"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Play, Plus, Search, Volume2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatTime, effectiveSfxVolume } from "@/lib/defaults";
import { loadSfxLibrary, upsertSfxLibraryAsset } from "@/lib/sfxLibrary";
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
    addSfxAsset,
    addSfxPlacement,
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
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    return Array.from(byKey.values()).sort((a, b) =>
      a.fileName.localeCompare(b.fileName)
    );
  }, [project.sfxAssets, folderItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((a) => a.fileName.toLowerCase().includes(q));
  }, [catalog, query]);

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
      previewRef.current?.pause();
      previewRef.current = null;
    };
  }, [open]);

  async function previewAsset(asset: SfxAsset) {
    previewRef.current?.pause();
    const audio = new Audio(asset.mediaUrl);
    previewRef.current = audio;
    audio.volume = Math.min(1, Math.max(0, effectiveSfxVolume(asset.volume, hitVolume)));
    try {
      await audio.play();
    } catch {
      setError("Could not preview — click anywhere on the page, then try Play again.");
    }
  }

  function placeSelected() {
    if (!selected || placing) return;
    setPlacing(true);
    setError(null);
    try {
      // Ensure asset is in the project
      const id = addSfxAsset({
        id: selected.id,
        mediaId: selected.mediaId,
        mediaUrl: selected.mediaUrl,
        fileName: selected.fileName,
        duration: selected.duration > 0 ? selected.duration : 1,
        volume: selected.volume ?? 1,
      });
      upsertSfxLibraryAsset({
        ...selected,
        id,
        volume: selected.volume ?? 1,
      });
      const dur = selected.duration > 0 ? selected.duration : 1;
      const placementId = addSfxPlacement({
        assetId: id,
        clipId: null,
        startAt: Number(atTime.toFixed(2)),
        offsetInClip: 0,
        trimStart: 0,
        trimEnd: dur,
        volume: hitVolume,
      });
      if (placementId) {
        setSelectedSfxPlacementId(placementId);
        requestSfxTab();
      }
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
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`add-sfx-row ${active ? "active" : ""}`}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <span className="add-sfx-row-meta">
                        <strong className="truncate">{a.fileName}</strong>
                        <span className="muted">
                          {a.duration > 0 ? formatTime(a.duration) : "…"}
                        </span>
                      </span>
                      <span className="add-sfx-row-actions">
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
