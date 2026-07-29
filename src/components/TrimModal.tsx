"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, createSegment, segmentsDuration, normalizeSegments } from "@/lib/defaults";
import { MAX_CLIP_DURATION, type TrimSegment } from "@/lib/types";
import { X, Play, Pause, Check, Plus, Trash2 } from "lucide-react";

interface TrimModalProps {
  open: boolean;
  src: string;
  fileName?: string | null;
  initialSegments: TrimSegment[];
  duration: number;
  onClose: () => void;
  onConfirm: (segments: TrimSegment[]) => void;
}

export function TrimModal({
  open,
  src,
  fileName,
  initialSegments,
  duration,
  onClose,
  onConfirm,
}: TrimModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [segments, setSegments] = useState<TrimSegment[]>(initialSegments);
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration);
  const [portrait, setPortrait] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const active = segments[activeIdx] || segments[0];
  const totalSelected = useMemo(() => segmentsDuration(segments), [segments]);

  useEffect(() => {
    if (!open) return;
    const segs =
      initialSegments.length > 0
        ? normalizeSegments(initialSegments)
        : [createSegment(0, Math.min(4, duration || 4))];
    setSegments(segs);
    setActiveIdx(0);
    setPlaying(false);
    setPreviewAll(false);
    setDur(duration);
    setLoadError(null);
    setReady(false);
  }, [open, initialSegments, duration, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open || !src) return;

    setReady(false);
    setLoadError(null);
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.src = src;
    v.load();

    const onMeta = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : duration;
      setDur(d);
      setPortrait(v.videoHeight > 0 && v.videoWidth > 0 && v.videoHeight / v.videoWidth >= 1.2);
      setReady(true);
      const first = segments[0];
      if (first) v.currentTime = first.start;
    };
    const onErr = () => setLoadError("Could not load video preview. Try re-uploading the file.");
    const onTime = () => {
      setCurrent(v.currentTime);
      if (!playing) return;
      const seg = segments[activeIdx];
      if (!seg) return;
      if (v.currentTime >= seg.end - 0.05) {
        if (previewAll && activeIdx < segments.length - 1) {
          const next = activeIdx + 1;
          setActiveIdx(next);
          v.currentTime = segments[next].start;
          return;
        }
        v.pause();
        setPlaying(false);
        setPreviewAll(false);
        v.currentTime = seg.start;
      }
    };

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
      v.removeEventListener("timeupdate", onTime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    const onTime = () => {
      setCurrent(v.currentTime);
      const seg = segments[activeIdx];
      if (!seg) return;
      if (v.currentTime >= seg.end - 0.05) {
        if (previewAll && activeIdx < segments.length - 1) {
          const next = activeIdx + 1;
          setActiveIdx(next);
          v.currentTime = segments[next].start;
          return;
        }
        v.pause();
        setPlaying(false);
        setPreviewAll(false);
        v.currentTime = seg.start;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [playing, previewAll, activeIdx, segments]);

  if (!open) return null;

  function updateActive(patch: Partial<TrimSegment>) {
    setSegments((prev) => {
      const next = prev.map((s, i) => (i === activeIdx ? { ...s, ...patch } : s));
      const total = segmentsDuration(next);
      if (total > MAX_CLIP_DURATION) return prev;
      return next;
    });
  }

  const clampStart = (v: number) => {
    if (!active) return;
    const next = Math.max(0, Math.min(v, active.end - 0.2));
    updateActive({ start: next });
    if (videoRef.current) videoRef.current.currentTime = next;
  };

  const clampEnd = (v: number) => {
    if (!active) return;
    const maxEnd = Math.min(dur || v, active.start + (MAX_CLIP_DURATION - (totalSelected - (active.end - active.start))));
    const next = Math.max(active.start + 0.2, Math.min(v, maxEnd));
    updateActive({ end: next });
  };

  const playSegment = async (all: boolean) => {
    const v = videoRef.current;
    if (!v || !active) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      setPreviewAll(false);
      return;
    }
    setPreviewAll(all);
    if (all) setActiveIdx(0);
    const startAt = all ? segments[0].start : active.start;
    v.currentTime = startAt;
    try {
      await v.play();
      setPlaying(true);
    } catch {
      setLoadError("Browser blocked playback — click Preview again.");
    }
  };

  const addSegment = () => {
    if (totalSelected >= MAX_CLIP_DURATION - 0.2) return;
    const last = segments[segments.length - 1];
    const start = Math.min(dur - 1, (last?.end || 0) + 0.1);
    const room = MAX_CLIP_DURATION - totalSelected;
    const end = Math.min(dur, start + Math.min(3, room));
    if (end - start < 0.2) return;
    const seg = createSegment(start, end);
    setSegments((p) => [...p, seg]);
    setActiveIdx(segments.length);
  };

  const removeSegment = (idx: number) => {
    if (segments.length <= 1) return;
    setSegments((p) => p.filter((_, i) => i !== idx));
    setActiveIdx((i) => Math.max(0, Math.min(i, segments.length - 2)));
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card wide">
        <div className="modal-header">
          <div>
            <h3>Trim clip</h3>
            <p className="muted">
              {fileName || "Add one or more ranges — they merge into one clip"} · max {MAX_CLIP_DURATION}s
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={`trim-video-wrap ${portrait ? "portrait" : "landscape"}`}>
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            controls={false}
            className="trim-video"
          />
          {!ready && !loadError && <div className="trim-loading">Loading preview…</div>}
          {loadError && <div className="trim-loading error-text">{loadError}</div>}
        </div>

        <div className="segment-tabs">
          {segments.map((seg, i) => (
            <button
              key={seg.id}
              type="button"
              className={`segment-tab ${i === activeIdx ? "active" : ""}`}
              onClick={() => {
                setActiveIdx(i);
                if (videoRef.current) videoRef.current.currentTime = seg.start;
              }}
            >
              Part {i + 1} ({(seg.end - seg.start).toFixed(1)}s)
              {segments.length > 1 && (
                <span
                  className="seg-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSegment(i);
                  }}
                >
                  <Trash2 size={12} />
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            className="btn ghost small"
            onClick={addSegment}
            disabled={totalSelected >= MAX_CLIP_DURATION - 0.2}
          >
            <Plus size={14} /> Add range
          </button>
        </div>

        {active && (
          <div className="trim-controls">
            <div className="trim-row">
              <label>Start {formatTime(active.start)}</label>
              <input
                type="range"
                min={0}
                max={dur || 1}
                step={0.05}
                value={active.start}
                onChange={(e) => clampStart(parseFloat(e.target.value))}
              />
            </div>
            <div className="trim-row">
              <label>End {formatTime(active.end)}</label>
              <input
                type="range"
                min={0}
                max={dur || 1}
                step={0.05}
                value={active.end}
                onChange={(e) => clampEnd(parseFloat(e.target.value))}
              />
            </div>
            <div className="trim-range-visual">
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  className="trim-selected"
                  style={{
                    left: `${dur ? (seg.start / dur) * 100 : 0}%`,
                    width: `${dur ? ((seg.end - seg.start) / dur) * 100 : 0}%`,
                  }}
                />
              ))}
              <div
                className="trim-playhead"
                style={{ left: `${dur ? (current / dur) * 100 : 0}%` }}
              />
            </div>
            <p className="muted center">
              Merged length: <strong>{totalSelected.toFixed(2)}s</strong> / {MAX_CLIP_DURATION}s · Source{" "}
              {formatTime(dur)} · {portrait ? "9:16 preview" : "16:9 preview"}
            </p>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => playSegment(false)} disabled={!ready}>
            {playing && !previewAll ? <Pause size={16} /> : <Play size={16} />}
            Preview part
          </button>
          <button className="btn ghost" onClick={() => playSegment(true)} disabled={!ready}>
            {playing && previewAll ? <Pause size={16} /> : <Play size={16} />}
            Preview merged
          </button>
          <button
            className="btn primary"
            disabled={totalSelected > MAX_CLIP_DURATION || segments.length === 0}
            onClick={() => onConfirm(normalizeSegments(segments))}
          >
            <Check size={16} />
            Use clip ({totalSelected.toFixed(1)}s)
          </button>
        </div>
      </div>
    </div>
  );
}
