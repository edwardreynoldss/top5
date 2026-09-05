"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatTime,
  createSegment,
  segmentsDuration,
  segmentsPlayDuration,
  normalizeSegments,
  normalizeCrop,
  normalizeBedMusic,
  normalizeHook,
  hookDuration,
  cropPreviewStyle,
  clampCropZoom,
  clampCropPan,
  clampClipSpeed,
  cropEdgeFromWindowPoint,
  normalizeZoomKeyframes,
  clampKeyframeZoom,
  sampleZoomKeyframes,
  clipProgressFromSource,
  sourceFromClipProgress,
  type CropEdge,
} from "@/lib/defaults";
import {
  MAX_CLIP_DURATION,
  MAX_HOOK_DURATION,
  MIN_HOOK_DURATION,
  MIN_KEYFRAME_ZOOM,
  MAX_KEYFRAME_ZOOM,
  MAX_ZOOM_KEYFRAMES,
  type ClipBedMusic,
  type ClipCrop,
  type ClipHook,
  type TrimSegment,
  type ZoomKeyframe,
} from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { nextPlaybackAction } from "@/lib/trimPreview";
import { RangeRail } from "@/components/RangeRail";
import { EdgeCropControls } from "@/components/EdgeCropControls";
import { X, Play, Pause, Check, Plus, Trash2, Music2, RefreshCw, Zap, Gauge } from "lucide-react";

type MusicFolderItem = {
  id: string;
  fileName: string;
  mediaId: string;
  mediaUrl: string;
  duration: number;
};

interface TrimModalProps {
  open: boolean;
  src: string;
  fileName?: string | null;
  initialSegments: TrimSegment[];
  initialCrop?: ClipCrop;
  initialBedMusic?: ClipBedMusic | null;
  initialHook?: ClipHook | null;
  initialMuteLookMusic?: boolean;
  /** Clip-level default speed used when a part has no override */
  initialSpeed?: number;
  duration: number;
  onClose: () => void;
  onConfirm: (
    segments: TrimSegment[],
    crop: ClipCrop,
    bedMusic?: ClipBedMusic,
    hook?: ClipHook,
    muteLookMusic?: boolean
  ) => void;
}

/** Main parts, optionally with hook teaser prepended for merged preview. */
function buildPreviewQueue(
  hook: ClipHook | undefined,
  main: TrimSegment[],
  hookSpeed = 1
): TrimSegment[] {
  if (!hook) return main;
  return [createSegment(hook.start, hook.end, hookSpeed), ...main];
}

export function TrimModal({
  open,
  src,
  fileName,
  initialSegments,
  initialCrop,
  initialBedMusic,
  initialHook,
  initialMuteLookMusic = false,
  initialSpeed = 1,
  duration,
  onClose,
  onConfirm,
}: TrimModalProps) {
  const defaultSpeed = clampClipSpeed(initialSpeed);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bedAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [segments, setSegments] = useState<TrimSegment[]>(() =>
    initialSegments.length > 0
      ? normalizeSegments(initialSegments, defaultSpeed)
      : [createSegment(0, Math.min(4, duration || 4), defaultSpeed)]
  );
  const [crop, setCrop] = useState<ClipCrop>(() => normalizeCrop(initialCrop));
  const [bedMusic, setBedMusic] = useState<ClipBedMusic | undefined>(() =>
    normalizeBedMusic(initialBedMusic)
  );
  const [muteLookMusic, setMuteLookMusic] = useState(initialMuteLookMusic === true);
  const [hook, setHook] = useState<ClipHook | undefined>(() =>
    normalizeHook(initialHook, duration || Infinity)
  );
  const [musicFolder, setMusicFolder] = useState<MusicFolderItem[]>([]);
  const [musicBusy, setMusicBusy] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);
  const [previewingHook, setPreviewingHook] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration > 0 ? duration : 0);
  const [portrait, setPortrait] = useState(false);
  const [videoAspect, setVideoAspect] = useState(9 / 16);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    kfId?: string | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const edgeDragRef = useRef<{ edge: CropEdge; pointerId: number } | null>(null);
  const [edgeDragging, setEdgeDragging] = useState<CropEdge | null>(null);
  const cropWindowRef = useRef<HTMLDivElement>(null);
  // Animated zoom timeline: independent scrub playhead (0–1) + selected point.
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [zoomProgress, setZoomProgress] = useState(0);
  const zoomProgressRef = useRef(0);
  const zoomRailRef = useRef<HTMLDivElement>(null);
  const zoomDragRef = useRef<{ mode: "scrub" | "kf"; kfId?: string; pointerId: number } | null>(null);
  const segmentsRef = useRef(segments);
  const hookRef = useRef(hook);
  const playQueueRef = useRef<TrimSegment[]>(segments);
  const queueIdxRef = useRef(0);
  const activeIdxRef = useRef(activeIdx);
  const previewAllRef = useRef(previewAll);
  const previewingHookRef = useRef(false);
  const selectedKfIdRef = useRef<string | null>(null);
  const playingRef = useRef(playing);
  const seekingRef = useRef(false);
  const seekClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  segmentsRef.current = segments;
  hookRef.current = hook;
  playQueueRef.current = buildPreviewQueue(hook, segments, defaultSpeed);
  activeIdxRef.current = activeIdx;
  previewAllRef.current = previewAll;
  playingRef.current = playing;
  selectedKfIdRef.current = selectedKfId;

  function applyPlaybackRate(v: HTMLVideoElement, speed: number) {
    v.playbackRate = clampClipSpeed(speed);
  }

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
  const activeSpeed = clampClipSpeed(
    typeof active?.speed === "number" ? active.speed : defaultSpeed
  );
  const zoomKeyframes = useMemo(
    () => normalizeZoomKeyframes(crop.zoomKeyframes),
    [crop.zoomKeyframes]
  );
  const hasKf = zoomKeyframes.length > 0;
  const activeKf = useMemo(
    () => zoomKeyframes.find((k) => k.id === selectedKfId) ?? null,
    [zoomKeyframes, selectedKfId]
  );
  const totalSelected = useMemo(() => segmentsDuration(segments), [segments]);
  const totalPlay = useMemo(
    () => segmentsPlayDuration(segments, defaultSpeed),
    [segments, defaultSpeed]
  );
  const hookLen = hookDuration(hook);
  const totalWithHook = totalSelected + hookLen;
  const totalPlayWithHook = totalPlay + hookLen / defaultSpeed;

  // Keep preview playbackRate in sync with the active part (or hook at default)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;
    if (previewingHook) {
      applyPlaybackRate(v, defaultSpeed);
      return;
    }
    applyPlaybackRate(v, activeSpeed);
  }, [open, activeSpeed, activeIdx, previewingHook, defaultSpeed]);

  // Reset trim state once per open session. Key includes saved trim/crop/bed/hook so
  // re-edit restores the clip's settings instead of a blank default.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null;
      bedAudioRef.current?.pause();
      return;
    }
    const segKey = initialSegments
      .map(
        (s) =>
          `${Number(s.start).toFixed(3)}-${Number(s.end).toFixed(3)}:${Number(s.speed ?? defaultSpeed).toFixed(2)}`
      )
      .join("|");
    const cropKey = initialCrop
      ? `${initialCrop.zoom}:${initialCrop.panX}:${initialCrop.panY}:${initialCrop.cropTop ?? 0}:${initialCrop.cropBottom ?? 0}:${initialCrop.cropLeft ?? 0}:${initialCrop.cropRight ?? 0}`
      : "default";
    const bedKey = initialBedMusic?.mediaId
      ? `${initialBedMusic.mediaId}:${initialBedMusic.startAt}:${initialBedMusic.volume}`
      : "none";
    const hookKey = initialHook
      ? `${Number(initialHook.start).toFixed(3)}-${Number(initialHook.end).toFixed(3)}`
      : "none";
    const sessionKey = `${src}::${duration}::${segKey}::${cropKey}::${bedKey}::${hookKey}::${defaultSpeed}`;
    if (sessionRef.current === sessionKey) return;
    sessionRef.current = sessionKey;

    const segs =
      initialSegments.length > 0
        ? normalizeSegments(initialSegments, defaultSpeed)
        : [createSegment(0, Math.min(4, duration || 4), defaultSpeed)];
    const nextHook = normalizeHook(initialHook, duration || Infinity);
    setSegments(segs);
    setCrop(normalizeCrop(initialCrop));
    setBedMusic(normalizeBedMusic(initialBedMusic));
    setMuteLookMusic(initialMuteLookMusic === true);
    setHook(nextHook);
    setActiveIdx(0);
    setPlaying(false);
    setPreviewAll(false);
    setPreviewingHook(false);
    previewingHookRef.current = false;
    setSelectedKfId(null);
    setZoomProgress(0);
    zoomProgressRef.current = 0;
    setCurrent(0);
    setDur(duration > 0 ? duration : 0);
    setPortrait(false);
    setVideoAspect(9 / 16);
    setLoadError(null);
    setReady(false);
    playingRef.current = false;
    previewAllRef.current = false;
    activeIdxRef.current = 0;
    queueIdxRef.current = 0;
    hookRef.current = nextHook;
    playQueueRef.current = buildPreviewQueue(nextHook, segs, defaultSpeed);
  }, [open, src, duration, initialSegments, initialCrop, initialBedMusic, initialHook, initialMuteLookMusic, defaultSpeed]);

  async function refreshMusicFolder() {
    setMusicBusy(true);
    try {
      const res = await fetch("/api/music/library");
      const data = await res.json();
      setMusicFolder(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMusicFolder([]);
    } finally {
      setMusicBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refreshMusicFolder();
  }, [open]);

  // Wall-clock progress into the clip for bed sync (accounts for per-part speed)
  const bedWallElapsed = useMemo(() => {
    if (previewAll) {
      const queue = buildPreviewQueue(hook, segments, defaultSpeed);
      const idx = Math.min(queueIdxRef.current, Math.max(0, queue.length - 1));
      let t = 0;
      for (let i = 0; i < idx; i++) {
        const s = queue[i];
        if (!s) continue;
        const spd = clampClipSpeed(typeof s.speed === "number" ? s.speed : defaultSpeed);
        t += Math.max(0, s.end - s.start) / spd;
      }
      const cur = queue[idx];
      if (cur) {
        const spd = clampClipSpeed(typeof cur.speed === "number" ? cur.speed : defaultSpeed);
        t += Math.max(0, current - cur.start) / spd;
      }
      return t;
    }
    if (previewingHook && hook) {
      return Math.max(0, current - hook.start) / defaultSpeed;
    }
    if (!active) return 0;
    return Math.max(0, current - active.start) / activeSpeed;
  }, [active, activeSpeed, previewAll, previewingHook, current, segments, hook, defaultSpeed]);

  const bedWindowSec = useMemo(() => {
    if (previewAll) return Math.max(0.2, totalPlayWithHook);
    if (previewingHook && hook) return Math.max(0.2, (hook.end - hook.start) / defaultSpeed);
    if (active) return Math.max(0.2, (active.end - active.start) / activeSpeed);
    return Math.max(0.2, totalPlay);
  }, [previewAll, previewingHook, hook, active, activeSpeed, defaultSpeed, totalPlay, totalPlayWithHook]);

  // Sync optional bed under the trim preview — never past the clip window
  useEffect(() => {
    if (!open) return;
    const url = bedMusic?.mediaUrl;
    if (!url) {
      bedAudioRef.current?.pause();
      return;
    }
    let audio = bedAudioRef.current;
    if (!audio || audio.getAttribute("data-src") !== url) {
      audio?.pause();
      audio = new Audio(url);
      audio.preload = "auto";
      audio.setAttribute("data-src", url);
      bedAudioRef.current = audio;
    }
    audio.volume = Math.min(1, Math.max(0, bedMusic.volume ?? 0.35));
    const startAt = Math.max(0, bedMusic.startAt ?? 0);
    const target = startAt + bedWallElapsed;
    const maxBed = startAt + bedWindowSec;
    if (bedWallElapsed >= bedWindowSec - 0.03) {
      audio.pause();
      return;
    }
    if (Math.abs(audio.currentTime - target) > 0.18) {
      try {
        audio.currentTime = Math.min(target, maxBed - 0.05);
      } catch {
        // ignore
      }
    }
    if (playing) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [open, bedMusic, bedWallElapsed, bedWindowSec, playing]);

  useEffect(() => {
    return () => {
      bedAudioRef.current?.pause();
      bedAudioRef.current = null;
    };
  }, []);

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
      // Drive the zoom-timeline playhead so the animated framing plays live.
      if (!previewingHookRef.current) {
        const prog = clipProgressFromSource(
          segmentsRef.current,
          activeIdxRef.current,
          t
        );
        zoomProgressRef.current = prog;
        setZoomProgress(prog);
      }
      if (!playingRef.current) return;

      // Hook-only preview: stop at hook end
      if (previewingHookRef.current && !previewAllRef.current) {
        const h = hookRef.current;
        if (!h) return;
        if (t >= h.end - 0.04) {
          v.pause();
          playingRef.current = false;
          previewingHookRef.current = false;
          setPlaying(false);
          setPreviewingHook(false);
          seekVideo(v, h.start);
          setCurrent(h.start);
        }
        return;
      }

      const merged = previewAllRef.current;
      const segs = merged ? playQueueRef.current : segmentsRef.current;
      const idx = merged ? queueIdxRef.current : activeIdxRef.current;
      const seg = segs[idx];
      if (!seg) return;

      const action = nextPlaybackAction({
        currentTime: t,
        seg,
        previewAll: merged,
        segIndex: idx,
        segCount: segs.length,
      });

      if (action === "continue") return;

      if (action === "advance") {
        const next = idx + 1;
        const nextSeg = segs[next];
        if (!nextSeg) return;
        if (merged) {
          queueIdxRef.current = next;
          const hasHook = Boolean(hookRef.current);
          if (hasHook) {
            if (next === 0) {
              previewingHookRef.current = true;
              setPreviewingHook(true);
            } else {
              previewingHookRef.current = false;
              setPreviewingHook(false);
              const mainIdx = next - 1;
              activeIdxRef.current = mainIdx;
              setActiveIdx(mainIdx);
            }
          } else {
            activeIdxRef.current = next;
            setActiveIdx(next);
          }
        } else {
          activeIdxRef.current = next;
          setActiveIdx(next);
        }
        applyPlaybackRate(
          v,
          typeof nextSeg.speed === "number" ? nextSeg.speed : defaultSpeed
        );
        seekVideo(v, nextSeg.start);
        void v.play().catch(() => undefined);
        return;
      }

      v.pause();
      playingRef.current = false;
      previewAllRef.current = false;
      previewingHookRef.current = false;
      setPlaying(false);
      setPreviewAll(false);
      setPreviewingHook(false);
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
      const kfId = selectedKfIdRef.current;
      setCrop((c) => {
        const kfs = normalizeZoomKeyframes(c.zoomKeyframes);
        if (kfs.length > 0) {
          // With a zoom path, scroll adjusts the selected point (not base zoom).
          if (!kfId || !kfs.some((k) => k.id === kfId)) return c;
          const next = kfs.map((k) =>
            k.id === kfId ? { ...k, zoom: clampKeyframeZoom(k.zoom + step) } : k
          );
          return { ...c, zoomKeyframes: normalizeZoomKeyframes(next) };
        }
        return { ...c, zoom: clampCropZoom(c.zoom + step) };
      });
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

  /** Update one zoom keyframe (re-normalizes so times stay sorted/unique). */
  function updateKeyframe(id: string, patch: Partial<ZoomKeyframe>) {
    setCrop((c) => {
      const kfs = normalizeZoomKeyframes(c.zoomKeyframes).map((k) =>
        k.id === id ? { ...k, ...patch } : k
      );
      return { ...c, zoomKeyframes: normalizeZoomKeyframes(kfs) };
    });
  }

  /** Add a zoom point at the current scrub position, capturing the shown framing. */
  function addKeyframeAtScrub() {
    const existing = normalizeZoomKeyframes(crop.zoomKeyframes);
    if (existing.length >= MAX_ZOOM_KEYFRAMES) return;
    const t = Math.max(0, Math.min(1, zoomProgressRef.current));
    const sampled = sampleZoomKeyframes(existing, t);
    const kf: ZoomKeyframe = {
      id: uuidv4(),
      t,
      zoom: clampKeyframeZoom(sampled?.zoom ?? (existing.length === 0 ? 1.4 : 1)),
      panX: clampCropPan(sampled?.panX ?? 50),
      panY: clampCropPan(sampled?.panY ?? 50),
    };
    setCrop((c) => ({
      ...c,
      zoomKeyframes: normalizeZoomKeyframes([
        ...normalizeZoomKeyframes(c.zoomKeyframes),
        kf,
      ]),
    }));
    setSelectedKfId(kf.id);
  }

  function removeKeyframe(id: string) {
    setCrop((c) => {
      const kfs = normalizeZoomKeyframes(c.zoomKeyframes).filter((k) => k.id !== id);
      const next = { ...c };
      if (kfs.length > 0) next.zoomKeyframes = kfs;
      else delete next.zoomKeyframes;
      return next;
    });
    setSelectedKfId((cur) => (cur === id ? null : cur));
  }

  function clearKeyframes() {
    setCrop((c) => {
      const next = { ...c };
      delete next.zoomKeyframes;
      return next;
    });
    setSelectedKfId(null);
  }

  /** Move the zoom-timeline playhead: seek the preview and pause any playback. */
  function scrubZoomTo(progress: number, opts?: { pause?: boolean }) {
    const prog = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    zoomProgressRef.current = prog;
    setZoomProgress(prog);
    if (opts?.pause !== false && playingRef.current) {
      videoRef.current?.pause();
      playingRef.current = false;
      previewAllRef.current = false;
      previewingHookRef.current = false;
      setPlaying(false);
      setPreviewAll(false);
      setPreviewingHook(false);
      endSeek();
    }
    const { partIndex, sourceTime } = sourceFromClipProgress(segmentsRef.current, prog);
    activeIdxRef.current = partIndex;
    setActiveIdx(partIndex);
    const v = videoRef.current;
    if (v) {
      seekVideo(v, sourceTime);
      setCurrent(sourceTime);
    }
  }

  function railProgressFromClientX(clientX: number) {
    const el = zoomRailRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  const onZoomRailPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    zoomRailRef.current?.setPointerCapture?.(e.pointerId);
    zoomDragRef.current = { mode: "scrub", pointerId: e.pointerId };
    scrubZoomTo(railProgressFromClientX(e.clientX));
  };

  const onZoomRailPointerMove = (e: React.PointerEvent) => {
    const d = zoomDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const p = railProgressFromClientX(e.clientX);
    if (d.mode === "kf" && d.kfId) {
      updateKeyframe(d.kfId, { t: p });
      scrubZoomTo(p, { pause: false });
    } else {
      scrubZoomTo(p);
    }
  };

  const onZoomRailPointerUp = (e: React.PointerEvent) => {
    const d = zoomDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    zoomDragRef.current = null;
    try {
      zoomRailRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKeyframePointerDown = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedKfId(id);
    selectedKfIdRef.current = id;
    zoomRailRef.current?.setPointerCapture?.(e.pointerId);
    zoomDragRef.current = { mode: "kf", kfId: id, pointerId: e.pointerId };
    const kf = normalizeZoomKeyframes(crop.zoomKeyframes).find((k) => k.id === id);
    if (kf) scrubZoomTo(kf.t, { pause: false });
  };

  const playSegment = async (all: boolean, hookOnly = false) => {
    const v = videoRef.current;
    if (!v) return;
    if (!hookOnly && !active) return;
    if (hookOnly && !hookRef.current) return;

    const modeKey = hookOnly ? "hook" : all ? "all" : "part";
    const currentMode = !playingRef.current
      ? null
      : previewingHookRef.current && !previewAllRef.current
        ? "hook"
        : previewAllRef.current
          ? "all"
          : "part";

    // Toggle pause only when the same mode is already playing
    if (playingRef.current && currentMode === modeKey) {
      v.pause();
      playingRef.current = false;
      previewAllRef.current = false;
      previewingHookRef.current = false;
      setPlaying(false);
      setPreviewAll(false);
      setPreviewingHook(false);
      endSeek();
      return;
    }

    if (playingRef.current) {
      v.pause();
    }

    const queue = buildPreviewQueue(hookRef.current, segmentsRef.current, defaultSpeed);
    playQueueRef.current = queue;

    let startAt = 0;
    if (hookOnly && hookRef.current) {
      startAt = hookRef.current.start;
      queueIdxRef.current = 0;
      previewAllRef.current = false;
      previewingHookRef.current = true;
      setPreviewAll(false);
      setPreviewingHook(true);
    } else if (all) {
      startAt = queue[0]?.start ?? 0;
      queueIdxRef.current = 0;
      previewAllRef.current = true;
      previewingHookRef.current = Boolean(hookRef.current);
      setPreviewAll(true);
      setPreviewingHook(Boolean(hookRef.current));
      if (!hookRef.current) {
        activeIdxRef.current = 0;
        setActiveIdx(0);
      }
    } else {
      const startIdx = activeIdxRef.current;
      startAt = segmentsRef.current[startIdx]?.start ?? 0;
      queueIdxRef.current = 0;
      previewAllRef.current = false;
      previewingHookRef.current = false;
      setPreviewAll(false);
      setPreviewingHook(false);
      setActiveIdx(startIdx);
    }

    // Reset the zoom-timeline playhead to the start of what's about to play so
    // the animated zoom replays from the beginning (hook stays static).
    if (!hookOnly) {
      const p0 = all
        ? 0
        : clipProgressFromSource(
            segmentsRef.current,
            activeIdxRef.current,
            startAt
          );
      zoomProgressRef.current = p0;
      setZoomProgress(p0);
    }

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

      const rateSeg = hookOnly
        ? { speed: defaultSpeed }
        : all
          ? queue[0]
          : segmentsRef.current[activeIdxRef.current];
      applyPlaybackRate(
        v,
        typeof rateSeg?.speed === "number" ? rateSeg.speed : defaultSpeed
      );

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
      previewingHookRef.current = false;
      setPlaying(false);
      setPreviewingHook(false);
      endSeek();
      setLoadError("Browser blocked playback — click Preview again.");
    }
  };

  /** Play only the hook teaser (stops at hook end). */
  const playHookOnly = () => void playSegment(false, true);

  function enableDefaultHook() {
    const sourceDur = dur || duration || 0;
    const start = Math.max(0, Math.min(sourceDur, active?.start ?? 0));
    const end = Math.min(sourceDur, start + Math.min(MAX_HOOK_DURATION, 1.5));
    const next = normalizeHook({ start, end }, sourceDur || Infinity);
    setHook(next);
    hookRef.current = next;
  }

  function updateHookRange(patch: Partial<ClipHook>) {
    const sourceDur = dur || duration || 0;
    const base = hook ?? { start: 0, end: MIN_HOOK_DURATION };
    const next = normalizeHook({ ...base, ...patch }, sourceDur || Infinity);
    setHook(next);
    hookRef.current = next;
    if (!next) return;
    const v = videoRef.current;
    if (!v) return;
    const seekTo =
      patch.start != null
        ? next.start
        : patch.end != null
          ? Math.max(next.start, Math.min(next.end - 0.05, current))
          : next.start;
    seekVideo(v, seekTo);
    setCurrent(seekTo);
  }

  const addSegment = () => {
    if (totalSelected >= MAX_CLIP_DURATION - 0.2) return;
    const last = segments[segments.length - 1];
    const start = Math.min(Math.max(0, (dur || 1) - 1), (last?.end || 0) + 0.1);
    const room = MAX_CLIP_DURATION - totalSelected;
    const end = Math.min(dur || start + 3, start + Math.min(3, room));
    if (end - start < 0.2) return;
    const seg = createSegment(start, end, activeSpeed);
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
    if (edgeDragRef.current) return;
    const kfs = normalizeZoomKeyframes(crop.zoomKeyframes);
    let kfId: string | null = null;
    let startPanX = crop.panX;
    let startPanY = crop.panY;
    if (kfs.length > 0) {
      // With a zoom path, dragging pans the SELECTED point; ignore otherwise.
      const kf = selectedKfIdRef.current
        ? kfs.find((k) => k.id === selectedKfIdRef.current)
        : null;
      if (!kf) return;
      kfId = kf.id;
      startPanX = kf.panX;
      startPanY = kf.panY;
    }
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: startPanX,
      panY: startPanY,
      kfId,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (edgeDragRef.current) return;
    if (!dragRef.current || !stageRef.current) return;
    e.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    // Drag the video with the pointer — 1 frame-width ≈ full pan range
    const dx = ((e.clientX - dragRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.y) / rect.height) * 100;
    const nextPanX = Math.max(0, Math.min(100, dragRef.current.panX - dx));
    const nextPanY = Math.max(0, Math.min(100, dragRef.current.panY - dy));
    const kfId = dragRef.current.kfId;
    if (kfId) {
      updateKeyframe(kfId, { panX: nextPanX, panY: nextPanY });
    } else {
      setCrop((c) => ({ ...c, panX: nextPanX, panY: nextPanY }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (stageRef.current?.hasPointerCapture?.(e.pointerId)) {
      stageRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  function windowNormFromClient(clientX: number, clientY: number) {
    const el = cropWindowRef.current;
    if (!el) return { nx: 0.5, ny: 0.5 };
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return { nx: 0.5, ny: 0.5 };
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  function applyEdgeAtClient(edge: CropEdge, clientX: number, clientY: number) {
    const { nx, ny } = windowNormFromClient(clientX, clientY);
    setCrop((c) => cropEdgeFromWindowPoint(edge, nx, ny, c));
  }

  const onEdgePointerDown = (edge: CropEdge, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Cancel any pan drag
    dragRef.current = null;
    setDragging(false);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    edgeDragRef.current = { edge, pointerId: e.pointerId };
    setEdgeDragging(edge);
    applyEdgeAtClient(edge, e.clientX, e.clientY);
  };

  const onEdgePointerMove = (e: React.PointerEvent) => {
    const drag = edgeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    applyEdgeAtClient(drag.edge, e.clientX, e.clientY);
  };

  const onEdgePointerUp = (e: React.PointerEvent) => {
    const drag = edgeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    edgeDragRef.current = null;
    setEdgeDragging(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const sliderMax = Math.max(dur || 1, active?.end || 1, 1);
  const canUseClip =
    segments.length > 0 && totalSelected > 0 && totalSelected <= MAX_CLIP_DURATION;
  // Always preview in the final Short frame (9:16) so landscape sources
  // show cover-fit / zoom / edge crop the same way export will.
  const frameAspect = 9 / 16;
  // With an animated zoom path, the base frame is drawn at zoom 1 (edge crop
  // kept) and a CSS transform punches in about the pan point — this mirrors the
  // export's per-frame crop so preview == export.
  const displayCrop: ClipCrop = hasKf
    ? { ...crop, zoom: 1, panX: 50, panY: 50 }
    : crop;
  const cropLayout = cropPreviewStyle(displayCrop, { frameAspect, videoAspect });
  // The hook teaser renders on the static base frame (no per-frame punch-in),
  // matching export — so don't animate zoom while previewing the hook.
  const sampledZoom =
    hasKf && !previewingHook
      ? sampleZoomKeyframes(zoomKeyframes, zoomProgress)
      : null;
  const zoomAnimStyle: React.CSSProperties | undefined = sampledZoom
    ? {
        transformOrigin: `${sampledZoom.panX}% ${sampledZoom.panY}%`,
        transform: `scale(${sampledZoom.zoom})`,
      }
    : undefined;
  const shownZoom = sampledZoom ? sampledZoom.zoom : crop.zoom;
  const scrubSource = sourceFromClipProgress(segments, zoomProgress);
  const edges = {
    left: crop.cropLeft || 0,
    right: crop.cropRight || 0,
    top: crop.cropTop || 0,
    bottom: crop.cropBottom || 0,
  };

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
              {fileName || "Cut ranges, black-bar crop, then zoom/pan"} · max{" "}
              {MAX_CLIP_DURATION}s
              {" · optional hook up to "}
              {MAX_HOOK_DURATION}s
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="trim-modal-body">
          <div className="trim-preview-col">
            <div
              ref={stageRef}
              className={`trim-video-wrap crop-stage ${dragging ? "dragging" : ""} ${
                edgeDragging ? `edge-dragging edge-${edgeDragging}` : ""
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="zoom-anim-layer" style={zoomAnimStyle}>
                <div className="crop-content-window" style={cropLayout.windowStyle}>
                  <div className="crop-pad-content" style={cropLayout.contentStyle}>
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
                      style={cropLayout.videoStyle}
                    />
                  </div>
                </div>
              </div>
              {/* Transparent hit target so drag always works over the video */}
              <div className="crop-drag-layer" aria-hidden />
              {/* Edge handles sit in window space (above pan layer) so pan/zoom don't skew crop math */}
              <div
                ref={cropWindowRef}
                className="crop-edge-layer"
                style={{
                  ...cropLayout.windowStyle,
                  overflow: "visible",
                  background: "transparent",
                  pointerEvents: "none",
                }}
              >
                {cropLayout.shades.left > 0.05 ? (
                  <div
                    className="crop-edge-shade crop-edge-shade-left"
                    style={{ width: `${cropLayout.shades.left}%` }}
                  />
                ) : null}
                {cropLayout.shades.right > 0.05 ? (
                  <div
                    className="crop-edge-shade crop-edge-shade-right"
                    style={{ width: `${cropLayout.shades.right}%` }}
                  />
                ) : null}
                {cropLayout.shades.top > 0.05 ? (
                  <div
                    className="crop-edge-shade crop-edge-shade-top"
                    style={{
                      height: `${cropLayout.shades.top}%`,
                      left: `${cropLayout.shades.left}%`,
                      right: `${cropLayout.shades.right}%`,
                    }}
                  />
                ) : null}
                {cropLayout.shades.bottom > 0.05 ? (
                  <div
                    className="crop-edge-shade crop-edge-shade-bottom"
                    style={{
                      height: `${cropLayout.shades.bottom}%`,
                      left: `${cropLayout.shades.left}%`,
                      right: `${cropLayout.shades.right}%`,
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  className={`crop-edge-handle crop-edge-handle-left ${
                    edgeDragging === "left" ? "active" : ""
                  }`}
                  style={{ left: `${(edges.left * 100).toFixed(4)}%` }}
                  aria-label="Drag left edge to crop"
                  onPointerDown={(e) => onEdgePointerDown("left", e)}
                  onPointerMove={onEdgePointerMove}
                  onPointerUp={onEdgePointerUp}
                  onPointerCancel={onEdgePointerUp}
                />
                <button
                  type="button"
                  className={`crop-edge-handle crop-edge-handle-right ${
                    edgeDragging === "right" ? "active" : ""
                  }`}
                  style={{ left: `${((1 - edges.right) * 100).toFixed(4)}%` }}
                  aria-label="Drag right edge to crop"
                  onPointerDown={(e) => onEdgePointerDown("right", e)}
                  onPointerMove={onEdgePointerMove}
                  onPointerUp={onEdgePointerUp}
                  onPointerCancel={onEdgePointerUp}
                />
                <button
                  type="button"
                  className={`crop-edge-handle crop-edge-handle-top ${
                    edgeDragging === "top" ? "active" : ""
                  }`}
                  style={{ top: `${(edges.top * 100).toFixed(4)}%` }}
                  aria-label="Drag top edge to crop"
                  onPointerDown={(e) => onEdgePointerDown("top", e)}
                  onPointerMove={onEdgePointerMove}
                  onPointerUp={onEdgePointerUp}
                  onPointerCancel={onEdgePointerUp}
                />
                <button
                  type="button"
                  className={`crop-edge-handle crop-edge-handle-bottom ${
                    edgeDragging === "bottom" ? "active" : ""
                  }`}
                  style={{ top: `${((1 - edges.bottom) * 100).toFixed(4)}%` }}
                  aria-label="Drag bottom edge to crop"
                  onPointerDown={(e) => onEdgePointerDown("bottom", e)}
                  onPointerMove={onEdgePointerMove}
                  onPointerUp={onEdgePointerUp}
                  onPointerCancel={onEdgePointerUp}
                />
              </div>
              <div className="crop-guide" />
              {!ready && !loadError && <div className="trim-loading">Loading preview…</div>}
              {loadError && (
                <div className="trim-loading">
                  <p className="error-text">{loadError}</p>
                  <p className="muted">You can still set trim times and click Use clip.</p>
                </div>
              )}
              <div className="crop-hint">
                {hasKf ? (
                  <>
                    {activeKf
                      ? "Drag to pan this point · scroll to zoom it · "
                      : "Scrub the zoom bar below · "}
                    {shownZoom.toFixed(2)}×
                    {shownZoom > 1.001 ? " in" : ""}
                  </>
                ) : (
                  <>
                    Drag sides to crop · drag center to pan · scroll to zoom ·{" "}
                    {crop.zoom.toFixed(2)}×
                    {crop.zoom < 1 ? " out" : crop.zoom > 1 ? " in" : ""}
                  </>
                )}
              </div>
            </div>
            {ready && !loadError ? (
              <div className="zoom-timeline-block">
                <div className="zoom-timeline-head">
                  <span>Zoom timeline</span>
                  <span className="muted">
                    scrub to preview · {formatTime(scrubSource.sourceTime)}
                    {hasKf ? ` · ${shownZoom.toFixed(2)}×` : ""}
                  </span>
                </div>
                <div
                  ref={zoomRailRef}
                  className="zoom-rail"
                  onPointerDown={onZoomRailPointerDown}
                  onPointerMove={onZoomRailPointerMove}
                  onPointerUp={onZoomRailPointerUp}
                  onPointerCancel={onZoomRailPointerUp}
                >
                  <div className="zoom-rail-track" />
                  {zoomKeyframes.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={`zoom-kf ${k.id === selectedKfId ? "active" : ""}`}
                      style={{ left: `${(k.t * 100).toFixed(3)}%` }}
                      title={`${k.zoom.toFixed(2)}× · ${formatTime(
                        sourceFromClipProgress(segments, k.t).sourceTime
                      )}`}
                      onPointerDown={(e) => onKeyframePointerDown(k.id, e)}
                      aria-label="Zoom point"
                    >
                      <span className="zoom-kf-dot" />
                    </button>
                  ))}
                  <div
                    className="zoom-rail-playhead"
                    style={{ left: `${(zoomProgress * 100).toFixed(3)}%` }}
                  />
                </div>
                <div className="zoom-rail-actions">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={addKeyframeAtScrub}
                    disabled={zoomKeyframes.length >= MAX_ZOOM_KEYFRAMES}
                  >
                    <Plus size={14} /> Add zoom point
                  </button>
                  {activeKf ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => removeKeyframe(activeKf.id)}
                    >
                      <Trash2 size={14} /> Delete point
                    </button>
                  ) : null}
                  {hasKf ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={clearKeyframes}
                    >
                      Clear zoom
                    </button>
                  ) : null}
                </div>
                {activeKf ? (
                  <div className="zoom-kf-editor">
                    <label className="zoom-kf-row">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min={MIN_KEYFRAME_ZOOM}
                        max={MAX_KEYFRAME_ZOOM}
                        step={0.05}
                        value={activeKf.zoom}
                        onChange={(e) =>
                          updateKeyframe(activeKf.id, {
                            zoom: clampKeyframeZoom(parseFloat(e.target.value)),
                          })
                        }
                      />
                      <strong>{activeKf.zoom.toFixed(2)}×</strong>
                    </label>
                    <label className="zoom-kf-row">
                      <span>Pan X</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeKf.panX}
                        onChange={(e) =>
                          updateKeyframe(activeKf.id, {
                            panX: clampCropPan(parseFloat(e.target.value)),
                          })
                        }
                      />
                      <strong>{Math.round(activeKf.panX)}</strong>
                    </label>
                    <label className="zoom-kf-row">
                      <span>Pan Y</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeKf.panY}
                        onChange={(e) =>
                          updateKeyframe(activeKf.id, {
                            panY: clampCropPan(parseFloat(e.target.value)),
                          })
                        }
                      />
                      <strong>{Math.round(activeKf.panY)}</strong>
                    </label>
                    <p className="muted zoom-kf-hint">
                      Drag on the preview to pan this point · scroll to zoom it.
                      Add another point at a different time to make the zoom move.
                    </p>
                  </div>
                ) : hasKf ? (
                  <p className="muted zoom-kf-hint">
                    Tap a point to edit its zoom &amp; pan. Drag the bar to preview
                    any moment — playback resets to the start.
                  </p>
                ) : (
                  <p className="muted zoom-kf-hint">
                    Add zoom points to push in and pan across the clip (e.g. a
                    start point at 1× and an end point at 2×, panning to follow
                    the subject). The bar also scrubs the preview.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="trim-options-col modal-scroll">
          <div className="segment-tabs">
            {segments.map((seg, i) => {
              const spd = clampClipSpeed(
                typeof seg.speed === "number" ? seg.speed : defaultSpeed
              );
              return (
              <button
                key={seg.id}
                type="button"
                className={`segment-tab ${i === activeIdx ? "active" : ""}`}
                onClick={() => {
                  activeIdxRef.current = i;
                  setActiveIdx(i);
                  const media = videoRef.current;
                  if (media) {
                    applyPlaybackRate(media, spd);
                    seekVideo(media, seg.start);
                    setCurrent(seg.start);
                  }
                }}
              >
                Part {i + 1} ({(seg.end - seg.start).toFixed(1)}s
                {Math.abs(spd - 1) > 0.001 ? ` · ${spd.toFixed(2)}×` : ""})
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
              );
            })}
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
              <RangeRail
                min={0}
                max={sliderMax}
                start={active.start}
                end={active.end}
                playhead={current}
                markers={segments.filter((s) => s.id !== active.id)}
                minSpan={0.2}
                ariaLabel="Clip trim range"
                formatValue={(v) => formatTime(v)}
                onChange={({ start, end }) => {
                  const nextStart = Math.max(0, Math.min(start, end - 0.2));
                  const room =
                    MAX_CLIP_DURATION - (totalSelected - (active.end - active.start));
                  const maxEnd = Math.min(dur || end, nextStart + room);
                  const nextEnd = Math.max(nextStart + 0.2, Math.min(end, maxEnd));
                  updateActive({ start: nextStart, end: nextEnd });
                  const v = videoRef.current;
                  if (!v) return;
                  if (Math.abs(nextStart - active.start) > 0.01) {
                    seekVideo(v, nextStart);
                    setCurrent(nextStart);
                  }
                }}
              />
              <label
                className="clip-volume trim-part-speed"
                title={
                  segments.length > 1
                    ? `Speed for part ${activeIdx + 1}`
                    : "Playback speed for this clip"
                }
              >
                <Gauge size={14} className="muted-icon" />
                <span>
                  {segments.length > 1 ? `Part ${activeIdx + 1} · ` : ""}
                  {activeSpeed.toFixed(2)}×
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={activeSpeed}
                  aria-label={
                    segments.length > 1
                      ? `Speed for part ${activeIdx + 1}`
                      : "Clip playback speed"
                  }
                  onChange={(e) => {
                    const speed = clampClipSpeed(parseFloat(e.target.value) || 1);
                    updateActive({ speed });
                    const v = videoRef.current;
                    if (v) applyPlaybackRate(v, speed);
                  }}
                />
              </label>
              <p className="muted center">
                Merged length: <strong>{totalSelected.toFixed(2)}s</strong> / {MAX_CLIP_DURATION}s
                {Math.abs(totalPlay - totalSelected) > 0.05
                  ? ` · plays ${totalPlay.toFixed(2)}s`
                  : ""}
                {hookLen > 0 ? ` · +${hookLen.toFixed(1)}s hook` : ""}
                {ready
                  ? portrait
                    ? " · source 9:16"
                    : " · source 16:9 → framed in 9:16"
                  : loadError
                    ? " · preview unavailable"
                    : " · loading…"}
              </p>
            </div>
          )}

          <div className="crop-controls">
            <p className="field-label">Position, zoom & edge crop</p>
            <EdgeCropControls
              crop={crop}
              onChange={setCrop}
              videoAspect={videoAspect}
              frameAspect={frameAspect}
              showZoomPan={!hasKf}
            />
          </div>

          <div className="trim-hook-block">
            <div className="music-head">
              <Zap size={16} />
              <span>Hook teaser (optional)</span>
            </div>
            <p className="muted">
              Add a short snippet from this same video that plays first — then the full trim.
              Does not count against the {MAX_CLIP_DURATION}s main budget (max {MAX_HOOK_DURATION}s).
            </p>
            <label className="hook-toggle">
              <input
                type="checkbox"
                checked={Boolean(hook)}
                onChange={(e) => {
                  if (e.target.checked) enableDefaultHook();
                  else {
                    setHook(undefined);
                    hookRef.current = undefined;
                  }
                }}
              />
              Enable hook before main clip
            </label>
            {hook ? (
              <div className="trim-controls">
                <RangeRail
                  min={0}
                  max={sliderMax}
                  start={hook.start}
                  end={hook.end}
                  minSpan={MIN_HOOK_DURATION}
                  ariaLabel="Hook trim range"
                  formatValue={(v) => formatTime(v)}
                  onChange={({ start, end }) => updateHookRange({ start, end })}
                />
                <p className="muted center">
                  Hook length: <strong>{hookLen.toFixed(2)}s</strong> / {MAX_HOOK_DURATION}s
                  {" · "}
                  min {MIN_HOOK_DURATION}s
                </p>
                <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={!ready}
                    onClick={playHookOnly}
                  >
                    {playing && previewingHook && !previewAll ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    Preview hook
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setHook(undefined);
                      hookRef.current = undefined;
                    }}
                  >
                    Clear hook
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="trim-bed-block">
            <div className="music-head">
              <Music2 size={16} />
              <span>Clip bed music (optional)</span>
            </div>
            <p className="muted">
              Pick a track from <code>music/</code> for this clip only. Choose where the song
              starts — it stops when the clip ends (never runs past the clip).
            </p>
            <label
              className="field check"
              title="Silence Look background music while this clip plays — it continues after"
            >
              <input
                type="checkbox"
                checked={muteLookMusic}
                onChange={(e) => {
                  setMuteLookMusic(e.target.checked);
                  // Convenient default: opting out when adding a clip bed
                  if (e.target.checked && !bedMusic?.mediaId) {
                    /* leave bed unset — user may only want to mute look BGM */
                  }
                }}
              />
              <span>Skip Look background music on this clip</span>
            </label>
            <div className="music-folder-head">
              <strong>Folder (music/)</strong>
              <button
                type="button"
                className="btn ghost small"
                disabled={musicBusy}
                onClick={() => void refreshMusicFolder()}
              >
                <RefreshCw size={14} className={musicBusy ? "spin" : undefined} />
                Refresh
              </button>
            </div>
            {musicFolder.length > 0 ? (
              <ul className="music-folder-list">
                {musicFolder.map((item) => {
                  const activeBed = bedMusic?.mediaId === item.mediaId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`music-folder-item ${activeBed ? "active" : ""}`}
                        onClick={() => {
                          setBedMusic(
                            normalizeBedMusic({
                              mediaId: item.mediaId,
                              mediaUrl: item.mediaUrl,
                              fileName: item.fileName,
                              startAt: bedMusic?.mediaId === item.mediaId ? bedMusic.startAt : 0,
                              volume: bedMusic?.volume ?? 0.35,
                            })
                          );
                          // Clip already has its own bed — mute look BGM by default
                          setMuteLookMusic(true);
                        }}
                      >
                        <span className="truncate">{item.fileName}</span>
                        <span className="muted">
                          {item.duration > 0 ? `${item.duration.toFixed(1)}s` : "—"}
                          {activeBed ? " · selected" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">
                No beds in <code>music/</code> yet. Drop audio files there and Refresh.
              </p>
            )}
            {bedMusic?.mediaId ? (
              <div className="music-ready">
                <label className="field">
                  <span>
                    Start in song ({formatTime(bedMusic.startAt)}) · plays{" "}
                    {totalWithHook.toFixed(1)}s max
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(
                      0,
                      (musicFolder.find((m) => m.mediaId === bedMusic.mediaId)?.duration || 60) -
                        0.5
                    )}
                    step={0.1}
                    value={bedMusic.startAt}
                    onChange={(e) =>
                      setBedMusic(
                        normalizeBedMusic({
                          ...bedMusic,
                          startAt: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Bed volume ({Math.round(bedMusic.volume * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={bedMusic.volume}
                    onChange={(e) =>
                      setBedMusic(
                        normalizeBedMusic({
                          ...bedMusic,
                          volume: parseFloat(e.target.value),
                        })
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    bedAudioRef.current?.pause();
                    setBedMusic(undefined);
                  }}
                >
                  Clear clip bed
                </button>
              </div>
            ) : null}
          </div>
          </div>
        </div>

        <div className="modal-actions sticky-actions">
          <button
            className="btn ghost"
            onClick={() => void playSegment(false)}
            disabled={!ready}
          >
            {playing && !previewAll && !previewingHook ? (
              <Pause size={16} />
            ) : (
              <Play size={16} />
            )}
            Preview part
          </button>
          <button
            className="btn ghost"
            onClick={() => void playSegment(true)}
            disabled={!ready}
          >
            {playing && previewAll ? <Pause size={16} /> : <Play size={16} />}
            Preview merged{hookLen > 0 ? " + hook" : ""}
          </button>
          <button
            className="btn primary"
            disabled={!canUseClip}
            onClick={() =>
              onConfirm(
                normalizeSegments(segments, defaultSpeed),
                normalizeCrop(crop),
                normalizeBedMusic(bedMusic),
                normalizeHook(hook, dur || duration || Infinity),
                muteLookMusic
              )
            }
          >
            <Check size={16} />
            Use clip ({totalPlayWithHook.toFixed(1)}s)
          </button>
        </div>
      </div>
    </div>
  );
}
