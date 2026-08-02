"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatTime,
  createSegment,
  segmentsDuration,
  normalizeSegments,
  defaultCrop,
  normalizeCrop,
  cropPreviewStyle,
  clampCropZoom,
  clampCropEdge,
  MAX_EDGE_CROP,
} from "@/lib/defaults";
import { MAX_CLIP_DURATION, type ClipCrop, type TrimSegment } from "@/lib/types";
import { nextPlaybackAction } from "@/lib/trimPreview";
import { X, Play, Pause, Check, Plus, Trash2, RotateCcw } from "lucide-react";

interface TrimModalProps {
  open: boolean;
  src: string;
  fileName?: string | null;
  initialSegments: TrimSegment[];
  initialCrop?: ClipCrop;
  duration: number;
  onClose: () => void;
  onConfirm: (segments: TrimSegment[], crop: ClipCrop) => void;
}

export function TrimModal({
  open,
  src,
  fileName,
  initialSegments,
  initialCrop,
  duration,
  onClose,
  onConfirm,
}: TrimModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const [segments, setSegments] = useState<TrimSegment[]>(() =>
    initialSegments.length > 0
      ? normalizeSegments(initialSegments)
      : [createSegment(0, Math.min(4, duration || 4))]
  );
  const [crop, setCrop] = useState<ClipCrop>(() => normalizeCrop(initialCrop));
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration > 0 ? duration : 0);
  const [portrait, setPortrait] = useState(false);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const segmentsRef = useRef(segments);
  const activeIdxRef = useRef(activeIdx);
  const previewAllRef = useRef(previewAll);
  const playingRef = useRef(playing);
  const seekingRef = useRef(false);
  const seekClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  segmentsRef.current = segments;
  activeIdxRef.current = activeIdx;
  previewAllRef.current = previewAll;
  playingRef.current = playing;

  function beginSeek() {
    seekingRef.current = true;
    if (seekClearTimer.current) clearTimeout(seekClearTimer.current);
    // Always clear — seeked may not fire if value is unchanged or metadata is thin
    seekClearTimer.current = setTimeout(() => {
      seekingRef.current = false;
    }, 120);
  }

  function endSeek() {
    seekingRef.current = false;
    if (seekClearTimer.current) {
      clearTimeout(seekClearTimer.current);
      seekClearTimer.current = null;
    }
  }

  function seekVideo(v: HTMLVideoElement, t: number) {
    const target = Math.max(0, t);
    beginSeek();
    try {
      if (Math.abs(v.currentTime - target) > 0.02) {
        v.currentTime = target;
      } else {
        // Already there — don't leave seeking stuck waiting for seeked
        endSeek();
      }
    } catch {
      endSeek();
    }
  }

  const active = segments[activeIdx] || segments[0];
  const totalSelected = useMemo(() => segmentsDuration(segments), [segments]);

  // Reset trim state once per open session. Key includes saved trim/crop so
  // re-edit restores the clip's settings instead of a blank default.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null;
      return;
    }
    const segKey = initialSegments
      .map((s) => `${Number(s.start).toFixed(3)}-${Number(s.end).toFixed(3)}`)
      .join("|");
    const cropKey = initialCrop
      ? `${initialCrop.zoom}:${initialCrop.panX}:${initialCrop.panY}:${initialCrop.cropTop ?? 0}:${initialCrop.cropBottom ?? 0}`
      : "default";
    const sessionKey = `${src}::${duration}::${segKey}::${cropKey}`;
    if (sessionRef.current === sessionKey) return;
    sessionRef.current = sessionKey;

    const segs =
      initialSegments.length > 0
        ? normalizeSegments(initialSegments)
        : [createSegment(0, Math.min(4, duration || 4))];
    setSegments(segs);
    setCrop(normalizeCrop(initialCrop));
    setActiveIdx(0);
    setPlaying(false);
    setPreviewAll(false);
    setCurrent(0);
    setDur(duration > 0 ? duration : 0);
    setPortrait(false);
    setVideoAspect(16 / 9);
    setLoadError(null);
    setReady(false);
    playingRef.current = false;
    previewAllRef.current = false;
    activeIdxRef.current = 0;
  }, [open, src, duration, initialSegments, initialCrop]);

  // Lock page scroll while modal is open; backdrop/modal handle scrolling.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !src) return;
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false;
    let initialized = false;
    setReady(false);
    setLoadError(null);
    endSeek();

    const markReady = () => {
      if (cancelled || initialized) return;
      initialized = true;
      const d =
        Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : duration > 0
            ? duration
            : 0;
      if (d > 0) setDur(d);
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        const aspect = v.videoWidth / v.videoHeight;
        setVideoAspect(aspect);
        setPortrait(v.videoHeight / v.videoWidth >= 1.2);
      }
      setReady(true);
      try {
        const start = segmentsRef.current[0]?.start ?? 0;
        if (Number.isFinite(start) && start >= 0) {
          v.currentTime = start;
          setCurrent(start);
        }
      } catch {
        // ignore seek errors before enough data
      }
    };

    const onErr = () => {
      if (cancelled) return;
      const mediaError = v.error;
      setLoadError(
        mediaError
          ? `Preview failed (code ${mediaError.code}). Try re-uploading as MP4.`
          : "Could not load video preview. Try re-uploading the file."
      );
      setReady(false);
      // Fall back to known duration so trim sliders still work
      if (duration > 0) setDur(duration);
    };

    // Only init once — canplay can re-fire while playing and used to reseek/reset preview
    const onCanPlayOnce = () => {
      if (v.readyState >= 2) markReady();
    };
    let failsafeTimer: number | null = null;

    v.addEventListener("loadeddata", markReady);
    v.addEventListener("error", onErr);

    if (v.readyState >= 2) {
      markReady();
    } else if (v.readyState >= 1) {
      // Have metadata; wait for data, but don't loop on canplay
      v.addEventListener("canplay", onCanPlayOnce, { once: true });
      // Failsafe if canplay never comes
      failsafeTimer = window.setTimeout(() => {
        if (!cancelled && !initialized && v.readyState >= 1) markReady();
      }, 400);
    }

    return () => {
      cancelled = true;
      v.removeEventListener("loadeddata", markReady);
      v.removeEventListener("canplay", onCanPlayOnce);
      v.removeEventListener("error", onErr);
      if (failsafeTimer != null) window.clearTimeout(failsafeTimer);
    };
  }, [open, src, duration]);

  // Stable playback loop — refs avoid stale closures when trimming while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;

    const onSeeked = () => endSeek();

    const onTime = () => {
      // Don't permanently ignore updates if a seek guard got stuck
      if (seekingRef.current) return;
      const t = v.currentTime;
      setCurrent(t);
      if (!playingRef.current) return;

      const segs = segmentsRef.current;
      const idx = activeIdxRef.current;
      const seg = segs[idx];
      if (!seg) return;

      const action = nextPlaybackAction({
        currentTime: t,
        seg,
        previewAll: previewAllRef.current,
        segIndex: idx,
        segCount: segs.length,
      });

      if (action === "continue") return;

      if (action === "advance") {
        const next = idx + 1;
        const nextSeg = segs[next];
        if (!nextSeg) return;
        activeIdxRef.current = next;
        setActiveIdx(next);
        seekVideo(v, nextSeg.start);
        void v.play().catch(() => undefined);
        return;
      }

      v.pause();
      playingRef.current = false;
      previewAllRef.current = false;
      setPlaying(false);
      setPreviewAll(false);
      seekVideo(v, seg.start);
      setCurrent(seg.start);
    };

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onSeeked);
    // Some browsers throttle timeupdate — poll while playing as a backup
    const poll = window.setInterval(() => {
      if (!playingRef.current || seekingRef.current) return;
      onTime();
    }, 200);

    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onSeeked);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Scroll-wheel zoom over the viewer (also keeps sliders in sync)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const step = ev.deltaY > 0 ? -0.05 : 0.05;
      setCrop((c) => ({ ...c, zoom: clampCropZoom(c.zoom + step) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  if (!open) return null;

  function updateActive(patch: Partial<TrimSegment>) {
    setSegments((prev) => {
      const next = prev.map((s, i) =>
        i === activeIdxRef.current ? { ...s, ...patch } : s
      );
      const total = segmentsDuration(next);
      if (total > MAX_CLIP_DURATION) return prev;
      segmentsRef.current = next;
      return next;
    });
  }

  const clampStart = (value: number) => {
    if (!active) return;
    const next = Math.max(0, Math.min(value, active.end - 0.2));
    updateActive({ start: next });
    const v = videoRef.current;
    if (!v) return;
    seekVideo(v, next);
    setCurrent(next);
    if (playingRef.current) {
      // Keep preview running from the new in-point
      endSeek();
      void v.play().catch(() => undefined);
    }
  };

  const clampEnd = (value: number) => {
    if (!active) return;
    const maxEnd = Math.min(
      dur || value,
      active.start + (MAX_CLIP_DURATION - (totalSelected - (active.end - active.start)))
    );
    const next = Math.max(active.start + 0.2, Math.min(value, maxEnd));
    updateActive({ end: next });
    const v = videoRef.current;
    if (!v) return;
    // If playhead is past the new out-point, jump back to in-point and keep going
    if (playingRef.current && v.currentTime >= next - 0.04) {
      seekVideo(v, active.start);
      setCurrent(active.start);
      endSeek();
      void v.play().catch(() => undefined);
    }
  };

  const playSegment = async (all: boolean) => {
    const v = videoRef.current;
    if (!v || !active) return;

    // Toggle pause only when the same mode is already playing
    if (playingRef.current && previewAllRef.current === all) {
      v.pause();
      playingRef.current = false;
      previewAllRef.current = false;
      setPlaying(false);
      setPreviewAll(false);
      endSeek();
      return;
    }

    if (playingRef.current) {
      v.pause();
    }

    const startIdx = all ? 0 : activeIdxRef.current;
    const segs = segmentsRef.current;
    const startAt = segs[startIdx]?.start ?? 0;

    activeIdxRef.current = startIdx;
    previewAllRef.current = all;
    setActiveIdx(startIdx);
    setPreviewAll(all);

    try {
      endSeek();
      seekVideo(v, startAt);
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          v.removeEventListener("seeked", done);
          resolve();
        };
        v.addEventListener("seeked", done);
        window.setTimeout(done, 250);
      });
      endSeek();
      setCurrent(v.currentTime);

      // Set playing flags before play() so the timeupdate effect attaches immediately
      playingRef.current = true;
      setPlaying(true);
      setLoadError(null);

      await v.play();

      // If play was interrupted (seek/load), retry once from the in-point
      if (v.paused && playingRef.current) {
        endSeek();
        try {
          v.currentTime = startAt;
        } catch {
          // ignore
        }
        await v.play().catch(() => {
          throw new Error("play blocked");
        });
      }
      setCurrent(v.currentTime);
    } catch {
      playingRef.current = false;
      setPlaying(false);
      endSeek();
      setLoadError("Browser blocked playback — click Preview again.");
    }
  };

  const addSegment = () => {
    if (totalSelected >= MAX_CLIP_DURATION - 0.2) return;
    const last = segments[segments.length - 1];
    const start = Math.min(Math.max(0, (dur || 1) - 1), (last?.end || 0) + 0.1);
    const room = MAX_CLIP_DURATION - totalSelected;
    const end = Math.min(dur || start + 3, start + Math.min(3, room));
    if (end - start < 0.2) return;
    const seg = createSegment(start, end);
    setSegments((p) => {
      const next = [...p, seg];
      segmentsRef.current = next;
      return next;
    });
    setActiveIdx(segments.length);
    activeIdxRef.current = segments.length;
  };

  const removeSegment = (idx: number) => {
    if (segments.length <= 1) return;
    setSegments((p) => {
      const next = p.filter((_, i) => i !== idx);
      segmentsRef.current = next;
      return next;
    });
    setActiveIdx((i) => {
      const next = Math.max(0, Math.min(i, segments.length - 2));
      activeIdxRef.current = next;
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: crop.panX, panY: crop.panY };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !stageRef.current) return;
    e.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    // Drag the video with the pointer — 1 frame-width ≈ full pan range
    const dx = ((e.clientX - dragRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.y) / rect.height) * 100;
    setCrop((c) => ({
      ...c,
      panX: Math.max(0, Math.min(100, dragRef.current!.panX - dx)),
      panY: Math.max(0, Math.min(100, dragRef.current!.panY - dy)),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (stageRef.current?.hasPointerCapture?.(e.pointerId)) {
      stageRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const sliderMax = Math.max(dur || 1, active?.end || 1, 1);
  const canUseClip =
    segments.length > 0 && totalSelected > 0 && totalSelected <= MAX_CLIP_DURATION;
  const frameAspect = portrait ? 9 / 16 : 16 / 9;
  const cropStyle = cropPreviewStyle(crop, { frameAspect, videoAspect });

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card wide trim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Trim & crop</h3>
            <p className="muted">
              {fileName || "Cut ranges, crop edges, then zoom/pan"} · max {MAX_CLIP_DURATION}s
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-scroll">
          <div
            ref={stageRef}
            className={`trim-video-wrap ${portrait ? "portrait" : "landscape"} crop-stage ${
              dragging ? "dragging" : ""
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <video
              key={src}
              ref={videoRef}
              src={src}
              playsInline
              preload="auto"
              muted
              controls={false}
              draggable={false}
              className="trim-video"
              style={cropStyle}
            />
            {/* Transparent hit target so drag always works over the video */}
            <div className="crop-drag-layer" aria-hidden />
            <div className="crop-guide" />
            {!ready && !loadError && <div className="trim-loading">Loading preview…</div>}
            {loadError && (
              <div className="trim-loading">
                <p className="error-text">{loadError}</p>
                <p className="muted">You can still set trim times and click Use clip.</p>
              </div>
            )}
            <div className="crop-hint">
              Drag to reposition · scroll to zoom · crop top/bottom to cut text
              {" · "}
              {crop.zoom.toFixed(2)}×
              {crop.zoom < 1 ? " out" : crop.zoom > 1 ? " in" : ""}
            </div>
          </div>

          <div className="crop-controls">
            <div className="trim-row">
              <label>
                Crop top {Math.round((normalizeCrop(crop).cropTop || 0) * 100)}% · cut text / bars
              </label>
              <input
                type="range"
                min={0}
                max={MAX_EDGE_CROP}
                step={0.01}
                value={clampCropEdge(crop.cropTop ?? 0)}
                onChange={(e) =>
                  setCrop((c) =>
                    normalizeCrop({ ...c, cropTop: clampCropEdge(parseFloat(e.target.value)) })
                  )
                }
              />
            </div>
            <div className="trim-row">
              <label>
                Crop bottom {Math.round((normalizeCrop(crop).cropBottom || 0) * 100)}% · cut text /
                bars
              </label>
              <input
                type="range"
                min={0}
                max={MAX_EDGE_CROP}
                step={0.01}
                value={clampCropEdge(crop.cropBottom ?? 0)}
                onChange={(e) =>
                  setCrop((c) =>
                    normalizeCrop({ ...c, cropBottom: clampCropEdge(parseFloat(e.target.value)) })
                  )
                }
              />
            </div>
            <div className="trim-row">
              <label>
                Zoom {crop.zoom.toFixed(2)}×
                {crop.zoom < 1
                  ? " · zoomed out"
                  : crop.zoom > 1
                    ? " · punched in"
                    : " · fill frame"}
              </label>
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={clampCropZoom(crop.zoom)}
                onChange={(e) =>
                  setCrop((c) => ({ ...c, zoom: clampCropZoom(parseFloat(e.target.value)) }))
                }
              />
            </div>
            <div className="trim-row">
              <label>Pan X {crop.panX.toFixed(0)}% · or drag video</label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={crop.panX}
                onChange={(e) => setCrop((c) => ({ ...c, panX: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="trim-row">
              <label>Pan Y {crop.panY.toFixed(0)}% · or drag video</label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={crop.panY}
                onChange={(e) => setCrop((c) => ({ ...c, panY: parseFloat(e.target.value) }))}
              />
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setCrop(defaultCrop())}
            >
              <RotateCcw size={14} /> Reset crop
            </button>
          </div>

          <div className="segment-tabs">
            {segments.map((seg, i) => (
              <button
                key={seg.id}
                type="button"
                className={`segment-tab ${i === activeIdx ? "active" : ""}`}
                onClick={() => {
                  activeIdxRef.current = i;
                  setActiveIdx(i);
                  const media = videoRef.current;
                  if (media) {
                    seekVideo(media, seg.start);
                    setCurrent(seg.start);
                  }
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
                  max={sliderMax}
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
                  max={sliderMax}
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
                Merged length: <strong>{totalSelected.toFixed(2)}s</strong> / {MAX_CLIP_DURATION}s
                {ready ? (portrait ? " · 9:16" : " · 16:9") : loadError ? " · preview unavailable" : " · loading…"}
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions sticky-actions">
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
            disabled={!canUseClip}
            onClick={() => onConfirm(normalizeSegments(segments), normalizeCrop(crop))}
          >
            <Check size={16} />
            Use clip ({totalSelected.toFixed(1)}s)
          </button>
        </div>
      </div>
    </div>
  );
}
