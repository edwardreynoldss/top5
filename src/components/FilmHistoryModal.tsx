"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Loader2, Trash2, X, Save } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  deleteFilmArchive,
  formatArchiveWhen,
  listFilmArchives,
  reasonBadge,
  saveFilmArchive,
  type ProjectArchiveMeta,
} from "@/lib/projectHistory";

export function FilmHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { project, channelState, restoreFilmArchive } = useEditor();
  const [items, setItems] = useState<ProjectArchiveMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState<string>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listFilmArchives();
      setItems(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load previous films");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilterSlug("all");
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (filterSlug === "all") return items;
    return items.filter((i) => i.channelSlug === filterSlug);
  }, [items, filterSlug]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProjectArchiveMeta[]>();
    for (const item of filtered) {
      const key = item.channelSlug || "film";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    // Active channel first
    const active = channelState.activeSlug;
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === active) return -1;
      if (b === active) return 1;
      return a.localeCompare(b);
    });
  }, [filtered, channelState.activeSlug]);

  async function handleOpen(id: string) {
    if (
      !window.confirm(
        "Open this previous film in the editor?\n\nYour current work will be saved as a safety snapshot first (if it has clips) — reopening overwrites that one slot, it does not stack copies. Clip media must still exist on this machine."
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await restoreFilmArchive(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open film");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this saved film snapshot? This cannot be undone.")) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await deleteFilmArchive(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckpoint() {
    setSaving(true);
    setError(null);
    try {
      const meta = await saveFilmArchive({
        project,
        reason: "manual",
        channelSlug: project.exportSlot?.channelSlug || channelState.activeSlug,
        channelName: channelState.channels.find(
          (c) => c.slug === channelState.activeSlug
        )?.name,
        force: true,
      });
      if (!meta) throw new Error("Nothing saved");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save checkpoint");
    } finally {
      setSaving(false);
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
      <div className="modal-card wide film-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Open previous films</h3>
            <p className="muted">
              Snapshots from Export and before Reset — kept for about 2 months. Restores clips,
              trim, crop, speed, hook, beds, title, SFX, and export identity.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="film-history-toolbar">
          <label className="field inline-field">
            <span>Channel</span>
            <select
              className="input"
              value={filterSlug}
              onChange={(e) => setFilterSlug(e.target.value)}
            >
              <option value="all">All channels</option>
              {channelState.channels.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn ghost small"
            disabled={saving}
            onClick={() => void handleCheckpoint()}
            title="Save the current editor as a checkpoint"
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Save checkpoint
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="film-history-list">
          {loading ? (
            <p className="muted center">
              <Loader2 size={14} className="spin inline" /> Loading…
            </p>
          ) : filtered.length === 0 ? (
            <div className="film-history-empty">
              <FolderOpen size={28} className="muted-icon" />
              <p>
                No saved films yet. They appear here after you <strong>Export MP4</strong>, or
                when you <strong>Reset</strong> a project that has clips. You can also save a
                checkpoint anytime.
              </p>
            </div>
          ) : (
            grouped.map(([slug, rows]) => {
              const channelName =
                channelState.channels.find((c) => c.slug === slug)?.name || slug;
              return (
                <section key={slug} className="film-history-group">
                  <h4>{channelName}</h4>
                  <ul>
                    {rows.map((item) => (
                      <li key={item.id} className="film-history-row">
                        <div className="film-history-meta">
                          <strong className="truncate">{item.label}</strong>
                          <p className="muted truncate">{item.titlePreview}</p>
                          <p className="muted">
                            <span className="film-reason">{reasonBadge(item.reason)}</span>
                            {" · "}
                            {item.readyClipCount} clip{item.readyClipCount === 1 ? "" : "s"}
                            {" · "}
                            {formatArchiveWhen(item.createdAt)}
                          </p>
                        </div>
                        <div className="film-history-actions">
                          <button
                            type="button"
                            className="btn primary small"
                            disabled={busyId === item.id}
                            onClick={() => void handleOpen(item.id)}
                          >
                            {busyId === item.id ? (
                              <Loader2 size={14} className="spin" />
                            ) : (
                              <FolderOpen size={14} />
                            )}
                            Open
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busyId === item.id}
                            onClick={() => void handleDelete(item.id)}
                            title="Delete snapshot"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
