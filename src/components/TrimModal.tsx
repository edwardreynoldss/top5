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
  cropEdgeBars,
  clampCropZoom,
  clampClipSpeed,
} from "@/lib/defaults";
import {
  MAX_CLIP_DURATION,
  MAX_HOOK_DURATION,
  MIN_HOOK_DURATION,
  type ClipBedMusic,
  type ClipCrop,
  type ClipHook,
  type TrimSegment,
} from "@/lib/types";
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
  /** Clip-level default speed used when a part has no override */
  initialSpeed?: number;
  duration: number;
  onClose: () => void;
  onConfirm: (
    segments: TrimSegment[],
    crop: ClipCrop,
    bedMusic?: ClipBedMusic,
    hook?: ClipHook
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
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const segmentsRef = useRef(segments);
  const hookRef = useRef(hook);
  const playQueueRef = useRef<TrimSegment[]>(segments);
  const queueIdxRef = useRef(0);
  const activeIdxRef = useRef(activeIdx);
  const previewAllRef = useRef(previewAll);
  const previewingHookRef = useRef(false);
  const playingRef = useRef(playing);
  const seekingRef = useRef(false);
  const seekClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  segmentsRef.current = segments;
  hookRef.current = hook;
  playQueueRef.current = buildPreviewQueue(hook, segments, defaultSpeed);
  activeIdxRef.current = activeIdx;
  previewAllRef.current = previewAll;
  playingRef.current = playing;

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
    setHook(nextHook);
    setActiveIdx(0);
    setPlaying(false);
    setPreviewAll(false);
    setPreviewingHook(false);
    previewingHookRef.current = false;
    setCurrent(0);
    setDur(duration > 0 ? duration : 0);
    setPortrait(false);
    setVideoAspect(16 / 9);
    setLoadError(null);
    setReady(false);
    playingRef.current = false;
    previewAllRef.current = false;
    activeIdxRef.current = 0;
    queueIdxRef.current = 0;
    hookRef.current = nextHook;
    playQueueRef.current = buildPreviewQueue(nextHook, segs, defaultSpeed);
  }, [open, src, duration, initialSegments, initialCrop, initialBedMusic, initialHook, defaultSpeed]);

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
  // Always preview in the final Short frame (9:16) so landscape sources
  // show cover-fit / zoom / edge crop the same way export will.
  const frameAspect = 9 / 16;
  const cropStyle = cropPreviewStyle(crop, { frameAspect, videoAspect });
  const edgeBars = cropEdgeBars(crop);

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

        <div className="modal-scroll">
          <div
            ref={stageRef}
            className={`trim-video-wrap crop-stage ${dragging ? "dragging" : ""}`}
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
            {edgeBars.top > 0.001 && (
              <div
                className="crop-edge-bar crop-edge-bar-top"
                style={{ height: `${edgeBars.top * 100}%` }}
                aria-hidden
              />
            )}
            {edgeBars.bottom > 0.001 && (
              <div
                className="crop-edge-bar crop-edge-bar-bottom"
                style={{ height: `${edgeBars.bottom * 100}%` }}
                aria-hidden
              />
            )}
            {edgeBars.left > 0.001 && (
              <div
                className="crop-edge-bar crop-edge-bar-left"
                style={{ width: `${edgeBars.left * 100}%` }}
                aria-hidden
              />
            )}
            {edgeBars.right > 0.001 && (
              <div
                className="crop-edge-bar crop-edge-bar-right"
                style={{ width: `${edgeBars.right * 100}%` }}
                aria-hidden
              />
            )}
            {!ready && !loadError && <div className="trim-loading">Loading preview…</div>}
            {loadError && (
              <div className="trim-loading">
                <p className="error-text">{loadError}</p>
                <p className="muted">You can still set trim times and click Use clip.</p>
              </div>
            )}
            <div className="crop-hint">
              Drag to pan · scroll to zoom · {crop.zoom.toFixed(2)}×
              {crop.zoom < 1 ? " out" : crop.zoom > 1 ? " in" : ""}
            </div>
          </div>

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
            <EdgeCropControls crop={crop} onChange={setCrop} />
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
                        onClick={() =>
                          setBedMusic(
                            normalizeBedMusic({
                              mediaId: item.mediaId,
                              mediaUrl: item.mediaUrl,
                              fileName: item.fileName,
                              startAt: bedMusic?.mediaId === item.mediaId ? bedMusic.startAt : 0,
                              volume: bedMusic?.volume ?? 0.35,
                            })
                          )
                        }
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
                normalizeHook(hook, dur || duration || Infinity)
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
