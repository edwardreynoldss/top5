"use client";

import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Link2,
  Upload,
  Scissors,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { ClipCrop, RankClip, TrimSegment } from "@/lib/types";
import { TrimModal } from "./TrimModal";
import { DEFAULT_CLIP_DURATION, MAX_CLIP_DURATION } from "@/lib/types";
import {
  createSegment,
  getClipSegments,
  clipPlayDuration,
  defaultCrop,
  getClipCrop,
} from "@/lib/defaults";

export function ClipCard({ clip }: { clip: RankClip }) {
  const { updateClip, selectedClipId, setSelectedClipId, project } = useEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id });
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [url, setUrl] = useState(clip.sourceUrl || "");
  const [trimOpen, setTrimOpen] = useState(false);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<{
    mediaId: string;
    mediaUrl: string;
    duration: number;
    fileName: string;
    sourceUrl?: string | null;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const color = project.settings.rankColors[clip.rank] || "#fff";

  function cancelIngest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    updateClip(clip.id, { status: "empty", error: undefined });
  }

  async function ingestUpload(file: File) {
    cancelIngest();
    const ac = new AbortController();
    abortRef.current = ac;
    updateClip(clip.id, { status: "loading", error: undefined });
    setProgress(`Uploading ${Math.round(file.size / 1024 / 1024)}MB…`);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd, signal: ac.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPendingMeta({
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        duration: data.duration,
        fileName: data.fileName,
      });
      setPendingSrc(data.mediaUrl);
      setTrimOpen(true);
      updateClip(clip.id, { status: "empty" });
      setProgress(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        updateClip(clip.id, { status: "empty", error: undefined });
        setProgress(null);
        return;
      }
      updateClip(clip.id, {
        status: "error",
        error: e instanceof Error ? e.message : "Upload failed",
      });
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }

  async function ingestUrl() {
    if (!url.trim()) return;
    cancelIngest();
    const ac = new AbortController();
    abortRef.current = ac;
    updateClip(clip.id, { status: "loading", error: undefined, sourceUrl: url.trim() });
    setProgress("Fetching link…");
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail ? `${data.error}\n${data.detail}` : data.error || "Download failed");
      }
      setPendingMeta({
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        duration: data.duration,
        fileName: data.fileName,
        sourceUrl: data.sourceUrl,
      });
      setPendingSrc(data.mediaUrl);
      setTrimOpen(true);
      updateClip(clip.id, { status: "empty" });
      setProgress(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        updateClip(clip.id, { status: "empty", error: undefined });
        setProgress(null);
        return;
      }
      updateClip(clip.id, {
        status: "error",
        error: e instanceof Error ? e.message : "Download failed",
      });
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }

  function confirmTrim(segments: TrimSegment[], crop: ClipCrop) {
    if (!pendingMeta && !clip.mediaUrl) return;
    const meta = pendingMeta;
    const first = segments[0];
    const last = segments[segments.length - 1];
    updateClip(clip.id, {
      status: "ready",
      mediaId: meta?.mediaId ?? clip.mediaId,
      mediaUrl: meta?.mediaUrl ?? clip.mediaUrl,
      fileName: meta?.fileName ?? clip.fileName,
      sourceUrl: meta?.sourceUrl ?? clip.sourceUrl,
      duration: meta?.duration ?? clip.duration,
      segments,
      crop,
      trimStart: first?.start ?? 0,
      trimEnd: last?.end ?? DEFAULT_CLIP_DURATION,
      error: undefined,
    });
    setTrimOpen(false);
    setPendingSrc(null);
    setPendingMeta(null);
    setSelectedClipId(clip.id);
  }

  function clearClip() {
    cancelIngest();
    updateClip(clip.id, {
      status: "empty",
      mediaId: null,
      mediaUrl: null,
      fileName: null,
      sourceUrl: null,
      duration: 0,
      trimStart: 0,
      trimEnd: DEFAULT_CLIP_DURATION,
      segments: [createSegment(0, DEFAULT_CLIP_DURATION)],
      crop: defaultCrop(),
      error: undefined,
    });
    setUrl("");
  }

  const segs = getClipSegments(clip);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`clip-card ${selectedClipId === clip.id ? "selected" : ""}`}
        onClick={() => setSelectedClipId(clip.id)}
      >
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Reorder">
          <GripVertical size={16} />
        </button>

        <div className="clip-rank" style={{ color }}>
          {clip.rank}
        </div>

        <div className="clip-body">
          <div className="clip-top">
            <input
              className="input label-input"
              placeholder="Label (e.g. WEEE)"
              value={clip.label}
              onChange={(e) => updateClip(clip.id, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            {clip.status === "ready" && (
              <div className="clip-actions">
                <button
                  className="icon-btn"
                  title="Re-trim"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingSrc(clip.mediaUrl);
                    setPendingMeta(
                      clip.mediaId
                        ? {
                            mediaId: clip.mediaId,
                            mediaUrl: clip.mediaUrl!,
                            duration: clip.duration,
                            fileName: clip.fileName || "clip",
                            sourceUrl: clip.sourceUrl,
                          }
                        : null
                    );
                    setTrimOpen(true);
                  }}
                >
                  <Scissors size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearClip();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {clip.status === "ready" ? (
            <div className="clip-ready">
              <div className="thumb">
                <video
                  key={clip.mediaUrl || clip.id}
                  src={`${clip.mediaUrl!}#t=${segs[0]?.start || 0}`}
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
              <div className="clip-meta">
                <p className="truncate">{clip.fileName || "Clip ready"}</p>
                <p className="muted">
                  {segs.length} part{segs.length > 1 ? "s" : ""} · {clipPlayDuration(clip).toFixed(1)}s
                  {getClipCrop(clip).zoom > 1
                    ? ` · ${getClipCrop(clip).zoom.toFixed(1)}× zoom`
                    : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="clip-import" onClick={(e) => e.stopPropagation()}>
              <div className="url-row">
                <Link2 size={14} className="muted-icon" />
                <input
                  className="input"
                  placeholder="YouTube / TikTok / Instagram URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={clip.status === "loading"}
                />
                {clip.status === "loading" ? (
                  <button className="btn small danger-btn" onClick={cancelIngest}>
                    <X size={14} /> Cancel
                  </button>
                ) : (
                  <button
                    className="btn small"
                    onClick={ingestUrl}
                    disabled={!url.trim()}
                  >
                    Fetch
                  </button>
                )}
              </div>
              <div className="or-row">
                <span>or</span>
                {clip.status === "loading" ? (
                  <span className="muted">{progress || "Working…"}</span>
                ) : (
                  <button
                    className="btn ghost small"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={14} /> Upload file
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void ingestUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {clip.status === "loading" && (
                <p className="muted">
                  <Loader2 size={12} className="spin inline" /> {progress || "Processing…"} — you can cancel
                </p>
              )}
              {clip.error && <p className="error-text">{clip.error}</p>}
            </div>
          )}
        </div>
      </div>

      <TrimModal
        open={trimOpen && !!pendingSrc}
        src={pendingSrc || ""}
        fileName={pendingMeta?.fileName || clip.fileName}
        initialSegments={
          pendingMeta
            ? [
                createSegment(
                  0,
                  Math.min(DEFAULT_CLIP_DURATION, pendingMeta.duration || DEFAULT_CLIP_DURATION)
                ),
              ]
            : getClipSegments(clip)
        }
        initialCrop={pendingMeta ? defaultCrop() : getClipCrop(clip)}
        duration={pendingMeta?.duration || clip.duration || 0}
        onClose={() => {
          setTrimOpen(false);
          setPendingSrc(null);
          setPendingMeta(null);
        }}
        onConfirm={confirmTrim}
      />
    </>
  );
}
