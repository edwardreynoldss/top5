"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, Plus, Volume2, Type, Shapes } from "lucide-react";
import { useEditor } from "@/lib/store";
import { AddSfxAtTimeModal } from "./AddSfxAtTimeModal";
import { AddOverlayAtTimeModal, SnapCaptionView } from "./AddOverlayAtTimeModal";
import {
  getPlaybackOrder,
  clipPlayDuration,
  displayWord,
  getClipPlaybackSegments,
  getClipHook,
  getClipGapAfter,
  getHookGapAfter,
  hookDuration,
  getClipCrop,
  cropPreviewStyle,
  cropEdgeBars,
  clipTimelineOffsets,
  totalTimelineDuration,
  resolveSfxStartAt,
  resolveOverlayStartAt,
  clipLocalPlayProgress,
  sourceSeekFromLocalPlay,
  absoluteTimeForClipPlayhead,
  findClipAtAbsoluteTime,
  formatTime,
  effectiveSfxVolume,
  effectiveClipVolume,
  getSegmentSpeed,
  segmentPlayDuration,
  getClipBedMusic,
  defaultSticker,
  stickerPlayDuration,
} from "@/lib/defaults";
import { sfxMediaUrl } from "@/lib/sfxLibrary";
import { overlayMediaUrl } from "@/lib/overlayMedia";
import { fontCss, type RankClip } from "@/lib/types";

export function PreviewPhone({
  previewClip: _unusedPreviewClip = null,
  isPlaying,
  onPlayingChange,
}: {
  previewClip?: RankClip | null;
  isPlaying: boolean;
  onPlayingChange: (v: boolean) => void;
}) {
  void _unusedPreviewClip;
  const {
    project,
    addSfxPlacement,
    removeSfxPlacement,
    selectedSfxPlacementId,
    setSelectedSfxPlacementId,
    setSelectedClipId,
    requestSfxTab,
    removeOverlayPlacement,
    selectedOverlayId,
    setSelectedOverlayId,
    requestOverlaysTab,
  } = useEditor();
  const { settings } = project;
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const clipBedRef = useRef<HTMLAudioElement | null>(null);
  const stickerVideoRef = useRef<HTMLVideoElement>(null);
  const stickerArmedRef = useRef(false);
  const firedSfxRef = useRef<Set<string>>(new Set());
  const activeSfxRef = useRef<HTMLAudioElement[]>([]);
  const scrubbingRef = useRef(false);
  const advancingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const activeIndexRef = useRef(0);
  const segIndexRef = useRef(0);
  const sequenceRef = useRef<RankClip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [videoAspect, setVideoAspect] = useState(9 / 16);
  const [dropAssetId, setDropAssetId] = useState<string>("");
  const [transitionFlash, setTransitionFlash] = useState(false);
  /** Black hold after a clip finishes (overlays stay). */
  const [inGap, setInGap] = useState(false);
  /** Black hold after the hook teaser, before main parts. */
  const [inHookGap, setInHookGap] = useState(false);
  const [gapElapsed, setGapElapsed] = useState(0);
  const inGapRef = useRef(false);
  const inHookGapRef = useRef(false);
  const gapElapsedRef = useRef(0);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const [addSfxOpen, setAddSfxOpen] = useState(false);
  const [addSfxAt, setAddSfxAt] = useState(0);
  const [addOverlayOpen, setAddOverlayOpen] = useState(false);
  const [addOverlayAt, setAddOverlayAt] = useState(0);
  const [addOverlayKind, setAddOverlayKind] = useState<"text" | "media">("text");
  const absTimeRef = useRef(0);
  isPlayingRef.current = isPlaying;
  activeIndexRef.current = activeIndex;
  segIndexRef.current = segIndex;
  inGapRef.current = inGap;
  inHookGapRef.current = inHookGap;
  gapElapsedRef.current = gapElapsed;

  const sequence = useMemo(
    () => getPlaybackOrder(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );
  sequenceRef.current = sequence;
  const offsets = useMemo(
    () => clipTimelineOffsets(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );
  const totalDur = useMemo(
    () => totalTimelineDuration(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );

  // Full ranking preview only — never lock to a single selected clip
  const activeClip = sequence[activeIndex] ?? null;
  const segments = useMemo(
    () => (activeClip ? getClipPlaybackSegments(activeClip) : []),
    [activeClip]
  );
  const hasHook = Boolean(activeClip && getClipHook(activeClip));
  const activeSeg = segments[segIndex] || segments[0];
  const assets = useMemo(() => project.sfxAssets || [], [project.sfxAssets]);
  const placements = useMemo(() => project.sfxPlacements || [], [project.sfxPlacements]);
  const overlayPlacements = useMemo(
    () => project.overlayPlacements || [],
    [project.overlayPlacements]
  );

  const localPlay = useMemo(() => {
    if (!activeClip) return 0;
    return clipLocalPlayProgress(activeClip, segIndex, localTime);
  }, [activeClip, segIndex, localTime]);

  const absTime = useMemo(() => {
    if (!activeClip) return 0;
    const hit = offsets.find((o) => o.clipId === activeClip.id);
    if (inGap) {
      if (hit) return hit.start + hit.duration + gapElapsed;
    }
    if (inHookGap) {
      const hook = getClipHook(activeClip);
      const hookSeg = getClipPlaybackSegments(activeClip)[0];
      const hookPlay =
        hook && hookSeg ? segmentPlayDuration(activeClip, hookSeg) : 0;
      if (hit) return hit.start + hookPlay + gapElapsed;
    }
    return absoluteTimeForClipPlayhead(activeClip.id, localPlay, offsets);
  }, [activeClip, localPlay, offsets, inGap, inHookGap, gapElapsed]);
  absTimeRef.current = absTime;

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Defer so the opening contextmenu / menu click isn't eaten immediately
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  // Delete key removes the selected SFX hit or overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedOverlayId) {
        e.preventDefault();
        removeOverlayPlacement(selectedOverlayId);
        return;
      }
      if (selectedSfxPlacementId) {
        e.preventDefault();
        removeSfxPlacement(selectedSfxPlacementId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedSfxPlacementId,
    removeSfxPlacement,
    selectedOverlayId,
    removeOverlayPlacement,
  ]);

  function openPreviewContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (totalDur <= 0) return;
    const t = Number(absTimeRef.current.toFixed(2));
    onPlayingChange(false);
    stopAllSfx();
    setCtxMenu({ x: e.clientX, y: e.clientY, time: t });
  }

  function openAddSfxFromMenu() {
    if (!ctxMenu) return;
    setAddSfxAt(ctxMenu.time);
    setAddSfxOpen(true);
    setCtxMenu(null);
  }

  function openAddOverlayFromMenu(kind: "text" | "media") {
    if (!ctxMenu) return;
    setAddOverlayAt(ctxMenu.time);
    setAddOverlayKind(kind);
    setAddOverlayOpen(true);
    setCtxMenu(null);
  }

  useEffect(() => {
    if (!dropAssetId && assets[0]?.id) setDropAssetId(assets[0].id);
  }, [assets, dropAssetId]);

  const sticker = settings.sticker ?? defaultSticker();
  const stickerStartAt = Math.max(0, Number.isFinite(sticker.startAt) ? sticker.startAt : 20);
  const stickerEndAt = stickerStartAt + stickerPlayDuration(sticker);
  const [stickerMediaDone, setStickerMediaDone] = useState(false);
  const stickerActive =
    Boolean(sticker.enabled && sticker.mediaUrl) &&
    absTime >= stickerStartAt - 0.02 &&
    absTime < stickerEndAt &&
    !stickerMediaDone;

  // Play sticker once when the timeline crosses startAt — never loop, always muted
  useEffect(() => {
    const el = stickerVideoRef.current;
    if (!el || !sticker.enabled || !sticker.mediaUrl) {
      stickerArmedRef.current = false;
      return;
    }
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    el.playbackRate = Math.max(0.25, Math.min(3, sticker.speed || 1));
    el.loop = false;

    const onEnded = () => setStickerMediaDone(true);
    el.addEventListener("ended", onEnded);

    if (absTime < stickerStartAt - 0.02) {
      stickerArmedRef.current = false;
      setStickerMediaDone(false);
      try {
        el.pause();
      } catch {
        // ignore
      }
      return () => el.removeEventListener("ended", onEnded);
    }

    if (absTime >= stickerEndAt || stickerMediaDone) {
      try {
        el.pause();
      } catch {
        // ignore
      }
      return () => el.removeEventListener("ended", onEnded);
    }

    if (!stickerArmedRef.current) {
      stickerArmedRef.current = true;
      setStickerMediaDone(false);
      const localOffset = Math.max(0, absTime - stickerStartAt);
      try {
        // currentTime is in media seconds; playbackRate stretches wall-clock
        el.currentTime = Math.min(
          Math.max(0, localOffset * el.playbackRate),
          Math.max(0, (el.duration || 0) - 0.05)
        );
      } catch {
        // ignore
      }
      void el.play().catch(() => undefined);
    }
    return () => el.removeEventListener("ended", onEnded);
  }, [
    sticker.enabled,
    sticker.mediaUrl,
    sticker.speed,
    stickerStartAt,
    stickerEndAt,
    stickerMediaDone,
    absTime,
  ]);

  function stopAllSfx() {
    for (const a of activeSfxRef.current) {
      try {
        a.pause();
      } catch {
        // ignore
      }
    }
    activeSfxRef.current = [];
  }

  function resetSfxFiring(fromAbs = 0) {
    // Mark only SFX that already fully finished before fromAbs as fired.
    // Anything that should still be audible (including startAt === 0) stays unfired
    // so it can trigger immediately when play starts.
    firedSfxRef.current = new Set(
      placements
        .filter((p) => {
          const start = resolveSfxStartAt(p, offsets);
          const dur = Math.max(0.05, (p.trimEnd ?? 0) - (p.trimStart ?? 0));
          return start + dur <= fromAbs + 0.02;
        })
        .map((p) => p.id)
    );
  }

  function playSfxPlacement(p: (typeof placements)[number], absNow: number) {
    if (firedSfxRef.current.has(p.id)) return;
    const start = resolveSfxStartAt(p, offsets);
    const trimStart = Math.max(0, p.trimStart ?? 0);
    const trimEnd = Math.max(trimStart + 0.05, p.trimEnd ?? trimStart + 1);
    const dur = trimEnd - trimStart;
    const end = start + dur;
    // Catch late: if we crossed the start, still play the remaining tail
    if (absNow < start - 0.03 || absNow >= end - 0.02) return;

    const asset = assets.find((a) => a.id === p.assetId);
    if (!asset?.mediaUrl) return;

    firedSfxRef.current.add(p.id);
    const into = Math.max(0, absNow - start);
    const audio = new Audio(sfxMediaUrl(asset.mediaId, asset.mediaUrl));
    audio.preload = "auto";
    audio.volume = Math.min(1, Math.max(0, effectiveSfxVolume(asset.volume, p.volume)));

    const startPlayback = () => {
      try {
        audio.currentTime = trimStart + into;
      } catch {
        // ignore seek errors on thin metadata
      }
      void audio.play().catch(() => undefined);
    };

    const stopAt = trimEnd;
    const onAudioTime = () => {
      if (audio.currentTime >= stopAt - 0.03) {
        audio.pause();
        audio.removeEventListener("timeupdate", onAudioTime);
      }
    };
    audio.addEventListener("timeupdate", onAudioTime);
    activeSfxRef.current.push(audio);

    if (audio.readyState >= 2) {
      startPlayback();
    } else {
      audio.addEventListener("canplay", startPlayback, { once: true });
      // Some browsers need load() after setting src via constructor
      try {
        audio.load();
      } catch {
        startPlayback();
      }
      // Fallback if canplay never fires (cached / drop-folder stream)
      window.setTimeout(() => {
        if (audio.paused && !audio.ended) startPlayback();
      }, 40);
    }
  }

  function safePlay(el: HTMLVideoElement | null) {
    if (!el) return;
    void el.play().catch((err: unknown) => {
      const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
      // AbortError = interrupted by a new load/play; keep ranking preview going
      if (name === "AbortError") return;
      console.warn("preview play failed", err);
      onPlayingChange(false);
    });
  }

  // Load active clip media once per clip/url — never reseek on repeated canplay
  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip?.mediaUrl) {
      setMediaReady(false);
      return;
    }

    let cancelled = false;
    let initialized = false;
    setMediaReady(false);
    advancingRef.current = false;
    // Fresh clip load — leave any black-hold state from the previous clip
    inGapRef.current = false;
    inHookGapRef.current = false;
    gapElapsedRef.current = 0;
    setInGap(false);
    setInHookGap(false);
    setGapElapsed(0);

    const url = activeClip.mediaUrl;
    const start = scrubbingRef.current
      ? localTime
      : getClipPlaybackSegments(activeClip)[0]?.start || 0;

    const syncSrc = (el: HTMLVideoElement | null) => {
      if (!el) return false;
      if (el.getAttribute("src") !== url) {
        el.src = url;
        el.load();
        return true;
      }
      return false;
    };
    syncSrc(fg);
    syncSrc(bg);

    const finishInit = () => {
      if (cancelled || initialized) return;
      initialized = true;
      if (fg.videoWidth > 0 && fg.videoHeight > 0) {
        setVideoAspect(fg.videoWidth / fg.videoHeight);
      }
      try {
        if (Math.abs(fg.currentTime - start) > 0.08) {
          fg.currentTime = start;
        }
        if (bg && Math.abs(bg.currentTime - start) > 0.08) {
          bg.currentTime = start;
        }
      } catch {
        // ignore seek errors
      }
      setLocalTime(start);
      setMediaReady(true);
      advancingRef.current = false;
      if (isPlayingRef.current) {
        safePlay(fg);
        safePlay(bg);
      }
    };

    const onLoaded = () => finishInit();
    fg.addEventListener("loadeddata", onLoaded);
    // Already buffered (same src after scrub)
    if (fg.readyState >= 2 && fg.getAttribute("src") === url) {
      finishInit();
    }

    const failsafe = window.setTimeout(() => {
      if (!cancelled && !initialized && fg.readyState >= 1) finishInit();
      advancingRef.current = false;
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      fg.removeEventListener("loadeddata", onLoaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, activeClip?.mediaUrl]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg) return;

    if (isPlaying && activeClip?.mediaUrl && mediaReady) {
      resetSfxFiring(absTime);
      // Fire immediately on play (don't wait for timeupdate) so 0.00s hits are instant
      for (const p of placements) {
        playSfxPlacement(p, absTime);
      }
      safePlay(fg);
      if (bg) {
        bg.muted = true;
        safePlay(bg);
      }
    } else if (!isPlaying) {
      fg.pause();
      bg?.pause();
      stopAllSfx();
    }
    // While isPlaying && !mediaReady, do not pause — wait for load to finish
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeClip?.id, activeClip?.mediaUrl, mediaReady, onPlayingChange]);

  // Fire SFX as the playhead crosses their start — including startAt === 0.
  // Uses a wide catch window + seek-into so a late timeupdate still plays the hit.
  useEffect(() => {
    if (!isPlaying || totalDur <= 0) return;
    for (const p of placements) {
      playSfxPlacement(p, absTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absTime, isPlaying, placements, assets, offsets, totalDur]);

  // Drive black-gap hold on wall clock (video is paused)
  useEffect(() => {
    if (!inGap || !isPlaying || !activeClip) return;
    const gapSec = getClipGapAfter(activeClip);
    if (gapSec <= 0.05) {
      setInGap(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!inGapRef.current || !isPlayingRef.current) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const next = gapElapsedRef.current + dt;
      gapElapsedRef.current = next;
      setGapElapsed(next);
      if (next >= gapSec - 0.02) {
        // Finish gap → next clip
        inGapRef.current = false;
        gapElapsedRef.current = 0;
        setInGap(false);
        setGapElapsed(0);
        advancingRef.current = true;
        const seq = sequenceRef.current;
        const ni = activeIndexRef.current + 1;
        if (ni < seq.length) {
          if (settings.transition === "flash") {
            setTransitionFlash(true);
            window.setTimeout(() => setTransitionFlash(false), 120);
          }
          activeIndexRef.current = ni;
          segIndexRef.current = 0;
          setActiveIndex(ni);
          setSegIndex(0);
        } else {
          advancingRef.current = false;
          onPlayingChange(false);
        }
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGap, isPlaying, activeClip?.id, activeClip?.gapAfter, settings.transition]);

  // Black hold after hook teaser → then main parts
  useEffect(() => {
    if (!inHookGap || !isPlaying || !activeClip) return;
    const gapSec = getHookGapAfter(activeClip);
    if (gapSec <= 0.05) {
      inHookGapRef.current = false;
      setInHookGap(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!inHookGapRef.current || !isPlayingRef.current) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const next = gapElapsedRef.current + dt;
      gapElapsedRef.current = next;
      setGapElapsed(next);
      if (next >= gapSec - 0.02) {
        inHookGapRef.current = false;
        gapElapsedRef.current = 0;
        setInHookGap(false);
        setGapElapsed(0);
        const segs = getClipPlaybackSegments(activeClip);
        if (segs.length > 1) {
          advancingRef.current = true;
          segIndexRef.current = 1;
          setSegIndex(1);
          const fg = videoRef.current;
          const bg = bgRef.current;
          try {
            if (fg) fg.currentTime = segs[1].start;
            if (bg) bg.currentTime = segs[1].start;
          } catch {
            // ignore
          }
          window.setTimeout(() => {
            advancingRef.current = false;
            if (isPlayingRef.current) {
              safePlay(fg);
              safePlay(bg);
            }
          }, 40);
        }
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inHookGap, isPlaying, activeClip?.id, activeClip?.hookGapAfter]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip || !activeSeg) return;
    if (inGap || inHookGap) return;

    const segEnd = activeSeg.end;
    const segStart = activeSeg.start;

    const completeCurrent = () => {
      if (
        scrubbingRef.current ||
        advancingRef.current ||
        inGapRef.current ||
        inHookGapRef.current
      ) {
        return;
      }
      if (!isPlayingRef.current) return;

      // Finished hook → optional black → main parts
      if (segIndexRef.current < segments.length - 1) {
        const cur = sequenceRef.current[activeIndexRef.current];
        const leavingHook =
          Boolean(cur && getClipHook(cur)) && segIndexRef.current === 0;
        const hookGapSec = leavingHook && cur ? getHookGapAfter(cur) : 0;
        if (hookGapSec > 0.05) {
          advancingRef.current = true;
          try {
            fg.pause();
            bg?.pause();
          } catch {
            // ignore
          }
          inHookGapRef.current = true;
          gapElapsedRef.current = 0;
          setInHookGap(true);
          setGapElapsed(0);
          window.setTimeout(() => {
            advancingRef.current = false;
          }, 40);
          return;
        }

        const nextSeg = segments[segIndexRef.current + 1];
        const ni = segIndexRef.current + 1;
        advancingRef.current = true;
        segIndexRef.current = ni;
        setSegIndex(ni);
        try {
          fg.currentTime = nextSeg.start;
          if (bg) bg.currentTime = nextSeg.start;
        } catch {
          // ignore
        }
        window.setTimeout(() => {
          advancingRef.current = false;
        }, 80);
        safePlay(fg);
        safePlay(bg);
        return;
      }

      // Optional black hold before the next ranking clip
      const seq = sequenceRef.current;
      const cur = seq[activeIndexRef.current];
      const next = activeIndexRef.current + 1;
      const gapSec = cur && next < seq.length ? getClipGapAfter(cur) : 0;
      if (gapSec > 0.05 && !inGapRef.current) {
        advancingRef.current = true;
        try {
          fg.pause();
          bg?.pause();
        } catch {
          // ignore
        }
        inGapRef.current = true;
        gapElapsedRef.current = 0;
        setInGap(true);
        setGapElapsed(0);
        window.setTimeout(() => {
          advancingRef.current = false;
        }, 40);
        return;
      }

      // Advance to next ranking clip
      advancingRef.current = true;
      inGapRef.current = false;
      inHookGapRef.current = false;
      gapElapsedRef.current = 0;
      setInGap(false);
      setInHookGap(false);
      setGapElapsed(0);
      if (next < seq.length) {
        if (settings.transition === "flash") {
          setTransitionFlash(true);
          window.setTimeout(() => setTransitionFlash(false), 120);
        }
        activeIndexRef.current = next;
        segIndexRef.current = 0;
        setActiveIndex(next);
        setSegIndex(0);
        // advancingRef cleared when next clip media initializes
      } else {
        activeIndexRef.current = 0;
        segIndexRef.current = 0;
        setActiveIndex(0);
        setSegIndex(0);
        onPlayingChange(false);
        firedSfxRef.current.clear();
        advancingRef.current = false;
        try {
          const first = seq[0];
          const start = first ? getClipPlaybackSegments(first)[0]?.start || 0 : 0;
          fg.currentTime = start;
          if (bg) bg.currentTime = start;
          setLocalTime(start);
        } catch {
          // ignore
        }
      }
    };

    const onTime = () => {
      if (scrubbingRef.current || advancingRef.current) return;
      const t = fg.currentTime;
      setLocalTime(t);
      if (bg && Math.abs(bg.currentTime - t) > 0.15) {
        bg.currentTime = t;
      }
      if (!isPlayingRef.current) return;

      // Only complete after we've actually entered the segment (avoid seek glitches)
      if (t + 0.02 < segStart) return;

      const naturalEnd =
        Number.isFinite(fg.duration) && fg.duration > 0 ? fg.duration : Infinity;
      const endAt = Math.min(segEnd, naturalEnd);
      if (t >= endAt - 0.05) {
        completeCurrent();
      }
    };

    const onEnded = () => {
      if (!isPlayingRef.current) return;
      completeCurrent();
    };

    fg.addEventListener("timeupdate", onTime);
    fg.addEventListener("ended", onEnded);
    return () => {
      fg.removeEventListener("timeupdate", onTime);
      fg.removeEventListener("ended", onEnded);
    };
    // safePlay is stable enough via onPlayingChange; omit to avoid rebinding every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeClip,
    activeSeg,
    segments,
    onPlayingChange,
    settings.transition,
    inGap,
    inHookGap,
  ]);

  // Apply per-clip × master volume whenever the active clip or levels change
  useEffect(() => {
    const fg = videoRef.current;
    if (!fg || !activeClip) return;
    fg.volume = Math.min(1, effectiveClipVolume(activeClip, settings.clipVolume));
  }, [activeClip, activeClip?.volume, settings.clipVolume]);

  // Per-part speed (preview playbackRate; timeline length uses clipPlayDuration)
  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip || !activeSeg) return;
    const rate = getSegmentSpeed(activeClip, activeSeg);
    fg.playbackRate = rate;
    if (bg) bg.playbackRate = rate;
  }, [activeClip, activeClip?.speed, activeSeg, activeSeg?.speed, segIndex]);

  // Looping background music bed under the full ranking preview
  useEffect(() => {
    const url = settings.musicUrl;
    if (!url) {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
      return;
    }
    let audio = musicRef.current;
    if (!audio || audio.getAttribute("data-src") !== url) {
      audio?.pause();
      audio = new Audio(url);
      audio.loop = true;
      audio.setAttribute("data-src", url);
      musicRef.current = audio;
    }
    audio.volume = Math.min(1, Math.max(0, settings.musicVolume ?? 0.35));
    if (isPlaying && totalDur > 0) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
    return () => {
      // keep instance across play/pause; cleared when url changes / unmount
    };
  }, [settings.musicUrl, settings.musicVolume, isPlaying, totalDur]);

  // Optional per-clip bed from music/ — only under the active clip, capped to clip length
  useEffect(() => {
    const bed = activeClip ? getClipBedMusic(activeClip) : undefined;
    const url = bed?.mediaUrl;
    if (!url || !activeClip) {
      clipBedRef.current?.pause();
      return;
    }
    const clipDur = clipPlayDuration(activeClip);
    if (localPlay >= clipDur - 0.03) {
      clipBedRef.current?.pause();
      return;
    }
    let audio = clipBedRef.current;
    if (!audio || audio.getAttribute("data-src") !== url) {
      audio?.pause();
      audio = new Audio(url);
      audio.preload = "auto";
      audio.loop = false;
      audio.setAttribute("data-src", url);
      clipBedRef.current = audio;
    }
    audio.volume = Math.min(1, Math.max(0, bed.volume ?? 0.35));
    const startAt = Math.max(0, bed.startAt ?? 0);
    const target = startAt + Math.max(0, localPlay);
    if (Math.abs(audio.currentTime - target) > 0.18) {
      try {
        audio.currentTime = target;
      } catch {
        // ignore
      }
    }
    if (isPlaying) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [activeClip, activeClip?.bedMusic, localPlay, isPlaying]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
      if (clipBedRef.current) {
        clipBedRef.current.pause();
        clipBedRef.current = null;
      }
    };
  }, []);

  function seekAbsolute(t: number) {
    if (offsets.length === 0 || sequence.length === 0) return;
    const clamped = Math.max(0, Math.min(t, Math.max(0, totalDur - 0.05)));
    const hit = findClipAtAbsoluteTime(clamped, offsets);
    if (!hit) return;
    const clip = sequence.find((c) => c.id === hit.clipId);
    if (!clip) return;

    setSelectedClipId(null);
    onPlayingChange(false);
    stopAllSfx();
    resetSfxFiring(clamped);

    const idx = sequence.findIndex((c) => c.id === clip.id);
    scrubbingRef.current = true;
    setActiveIndex(Math.max(0, idx));

    if (hit.inGap) {
      const ge = Math.max(0, clamped - hit.start - hit.duration);
      inGapRef.current = true;
      inHookGapRef.current = false;
      gapElapsedRef.current = ge;
      setInGap(true);
      setInHookGap(false);
      setGapElapsed(ge);
      const { segIndex: si, sourceTime } = sourceSeekFromLocalPlay(clip, hit.duration);
      setSegIndex(si);
      setLocalTime(sourceTime);
      const fg = videoRef.current;
      const bg = bgRef.current;
      if (fg && clip.mediaUrl) {
        if (fg.getAttribute("src") !== clip.mediaUrl) {
          fg.src = clip.mediaUrl;
          fg.load();
          if (bg) {
            bg.src = clip.mediaUrl;
            bg.load();
          }
        }
        try {
          fg.pause();
          fg.currentTime = sourceTime;
          if (bg) {
            bg.pause();
            bg.currentTime = sourceTime;
          }
        } catch {
          // ignore
        }
      }
    } else {
      const local = Math.min(hit.duration, Math.max(0, clamped - hit.start));
      const seek = sourceSeekFromLocalPlay(clip, local);
      if (seek.inHookGap) {
        inGapRef.current = false;
        inHookGapRef.current = true;
        gapElapsedRef.current = seek.hookGapElapsed || 0;
        setInGap(false);
        setInHookGap(true);
        setGapElapsed(seek.hookGapElapsed || 0);
      } else {
        inGapRef.current = false;
        inHookGapRef.current = false;
        gapElapsedRef.current = 0;
        setInGap(false);
        setInHookGap(false);
        setGapElapsed(0);
      }
      setSegIndex(seek.segIndex);
      setLocalTime(seek.sourceTime);
      const fg = videoRef.current;
      const bg = bgRef.current;
      if (fg && clip.mediaUrl) {
        if (fg.getAttribute("src") !== clip.mediaUrl) {
          fg.src = clip.mediaUrl;
          fg.load();
          if (bg) {
            bg.src = clip.mediaUrl;
            bg.load();
          }
        }
        try {
          if (seek.inHookGap) {
            fg.pause();
            if (bg) bg.pause();
          }
          fg.currentTime = seek.sourceTime;
          if (bg) bg.currentTime = seek.sourceTime;
        } catch {
          // ignore
        }
      }
    }
    window.setTimeout(() => {
      scrubbingRef.current = false;
    }, 80);
  }

  function dropSfxAtPlayhead() {
    if (!dropAssetId || totalDur <= 0) return;
    onPlayingChange(false);
    stopAllSfx();
    const id = addSfxPlacement({
      assetId: dropAssetId,
      clipId: null,
      startAt: Number(absTime.toFixed(2)),
      offsetInClip: 0,
    });
    setSelectedSfxPlacementId(id);
    requestSfxTab();
  }

  function togglePlay() {
    if (!isPlaying) {
      setSelectedClipId(null);
      if (totalDur > 0 && absTime >= totalDur - 0.08) {
        const clip = sequence[0];
        if (clip) {
          const start = getClipPlaybackSegments(clip)[0]?.start || 0;
          inGapRef.current = false;
          inHookGapRef.current = false;
          gapElapsedRef.current = 0;
          setInGap(false);
          setInHookGap(false);
          setGapElapsed(0);
          setActiveIndex(0);
          setSegIndex(0);
          setLocalTime(start);
          firedSfxRef.current.clear();
          const fg = videoRef.current;
          const bg = bgRef.current;
          if (fg && clip.mediaUrl) {
            if (fg.getAttribute("src") !== clip.mediaUrl) {
              fg.src = clip.mediaUrl;
              fg.load();
              if (bg) {
                bg.src = clip.mediaUrl;
                bg.load();
              }
            }
            try {
              fg.currentTime = start;
              if (bg) bg.currentTime = start;
            } catch {
              // ignore
            }
          }
        }
      }
      onPlayingChange(true);
    } else {
      onPlayingChange(false);
    }
  }

  const title = settings.title;
  const ranksLayout = settings.ranksLayout;
  const ranksToShow = useMemo(() => {
    const ordered =
      settings.playOrder === "countdown"
        ? [...project.clips].sort((a, b) => b.rank - a.rank)
        : [...project.clips].sort((a, b) => a.rank - b.rank);
    return ordered;
  }, [project.clips, settings.playOrder]);

  const titleJustify =
    title.align === "left" ? "flex-start" : title.align === "right" ? "flex-end" : "center";

  const previewScale = 360 / 1080;
  const titleFontPx = title.fontSize * previewScale;
  const rankFontPx = ranksLayout.fontSize * previewScale;
  const rankGapPx = ranksLayout.gap * previewScale;
  const labelFontPx = ranksLayout.labelSize * previewScale;
  const barHeightPx = title.barHeight * previewScale;
  const fitFill = settings.aspectMode === "crop-fill";
  const crop = activeClip ? getClipCrop(activeClip) : null;
  const cropStyle = crop
    ? cropPreviewStyle(crop, { frameAspect: 9 / 16, videoAspect })
    : undefined;
  const edgeBars = crop ? cropEdgeBars(crop) : { top: 0, bottom: 0, left: 0, right: 0 };
  const titleOverlap = settings.titleOverlap !== false;
  const titleEnabled = title.enabled !== false;
  const previewBarH = !titleEnabled
    ? 0
    : title.showBar
      ? barHeightPx
      : titleFontPx * title.lines.length + 16;
  const videoTop = titleOverlap || !titleEnabled ? 0 : previewBarH;

  return (
    <div className="preview-shell">
      <div className="preview-phone">
        <div
          className="preview-stage"
          onContextMenu={openPreviewContextMenu}
          title={totalDur > 0 ? "Right-click to add text, object, or SFX at this time" : undefined}
        >
          {activeClip?.mediaUrl ? (
            <div
              className="preview-video-area"
              style={{
                top: videoTop,
                bottom: 0,
                left: 0,
                right: 0,
              }}
            >
              {!fitFill && (
                <video
                  ref={bgRef}
                  className="preview-bg"
                  muted
                  playsInline
                  preload="auto"
                  style={{
                    filter: `blur(${settings.blurAmount}px) saturate(1.1)`,
                    ...(cropStyle || null),
                  }}
                />
              )}
              <video
                ref={videoRef}
                className={fitFill ? "preview-fg fill" : "preview-fg"}
                playsInline
                preload="auto"
                style={cropStyle}
                onLoadedData={(e) => {
                  const v = e.currentTarget;
                  if (activeClip) {
                    v.volume = Math.min(
                      1,
                      effectiveClipVolume(activeClip, settings.clipVolume)
                    );
                  }
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoAspect(v.videoWidth / v.videoHeight);
                  }
                }}
              />
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
              {(inGap || inHookGap) && <div className="preview-black-gap" aria-hidden />}
              {!mediaReady && !inGap && !inHookGap && (
                <div className="preview-loading">Loading clip…</div>
              )}
              {transitionFlash && <div className="preview-flash" aria-hidden />}
            </div>
          ) : (
            <div className="preview-empty">
              <p>Add clips to preview your ranking Short</p>
            </div>
          )}

          {titleEnabled && title.showBar && (
            <div
              className="title-bar-bg"
              style={{
                background: `rgba(0,0,0,${title.barOpacity})`,
                height: `${barHeightPx}px`,
              }}
            />
          )}

          {titleEnabled && (
            <div
              className="title-overlay"
              style={{
                top: `${title.y}%`,
                left: `${title.x}%`,
                transform:
                  title.align === "left"
                    ? "translate(0, 0)"
                    : title.align === "right"
                      ? "translate(-100%, 0)"
                      : "translate(-50%, 0)",
                alignItems: titleJustify,
                fontFamily: fontCss(title.fontId),
                fontSize: `${titleFontPx}px`,
                gap: `${title.lineGap * previewScale}px`,
              }}
            >
              {title.lines.slice(0, 2).map((line) => (
                <div key={line.id} className="title-line" style={{ justifyContent: titleJustify }}>
                  {line.words.map((word, i) => (
                    <span key={word.id} className="title-word" style={{ color: word.color }}>
                      {i > 0 ? "\u00A0" : ""}
                      {displayWord(word.text, title.uppercase)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}

          {settings.showRankList && (
            <div
              className="rank-list"
              style={{
                left: `${ranksLayout.x}%`,
                top: `${ranksLayout.y}%`,
                gap: `${rankGapPx * 0.15}px`,
                fontFamily: fontCss(ranksLayout.fontId),
              }}
            >
              {ranksToShow.map((c) => {
                const isActive = activeClip?.rank === c.rank;
                // Progressive reveal: keep labels for ranks already played (and current)
                const seqIdx = sequence.findIndex((x) => x.id === c.id);
                const revealed =
                  settings.showActiveLabel &&
                  Boolean(c.label) &&
                  seqIdx >= 0 &&
                  seqIdx <= activeIndex;
                return (
                  <div
                    key={c.id}
                    className={`rank-row ${isActive ? "active" : ""} ${revealed ? "revealed" : ""}`}
                    style={{ minHeight: `${rankGapPx * 0.7}px` }}
                  >
                    <span
                      className="rank-num"
                      style={{
                        color: settings.rankColors[c.rank] || "#fff",
                        fontSize: `${rankFontPx}px`,
                      }}
                    >
                      {c.rank}.
                    </span>
                    {revealed ? (
                      <span className="rank-label" style={{ fontSize: `${labelFontPx}px` }}>
                        {c.label.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {sticker.enabled && sticker.mediaUrl ? (
            <video
              ref={stickerVideoRef}
              key={sticker.mediaUrl || "sticker"}
              className={`sticker-overlay ${stickerActive ? "active" : ""}`}
              src={sticker.mediaUrl || undefined}
              muted
              playsInline
              preload="auto"
              draggable={false}
              style={{
                transform: `translateX(-50%) scale(${Math.max(0.15, Math.min(1.5, sticker.scale || 1))})`,
                opacity: stickerActive ? 1 : 0,
                visibility: stickerActive ? "visible" : "hidden",
              }}
            />
          ) : null}

          {overlayPlacements.map((ov) => {
            const start = resolveOverlayStartAt(ov, offsets);
            const end = start + Math.max(0.2, ov.duration || 3);
            const visible = absTime + 0.02 >= start && absTime < end - 0.01;
            if (!visible) return null;
            const selected = ov.id === selectedOverlayId;
            if (ov.kind === "text") {
              return (
                <SnapCaptionView
                  key={ov.id}
                  overlay={ov}
                  selected={selected}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(ov.id);
                    setSelectedSfxPlacementId(null);
                  }}
                />
              );
            }
            const url = ov.mediaUrl || (ov.mediaId ? overlayMediaUrl(ov.mediaId) : "");
            if (!url) return null;
            const isVideo = /\.(webm|mp4|mov)(\?|$)/i.test(url);
            return (
              <div
                key={ov.id}
                className={`media-overlay ${selected ? "selected" : ""}`}
                style={{
                  left: `${ov.x}%`,
                  top: `${ov.y}%`,
                  transform: `translate(-50%, -50%) scale(${ov.scale || 1})`,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedOverlayId(ov.id);
                  setSelectedSfxPlacementId(null);
                }}
              >
                {isVideo ? (
                  <video src={url} muted playsInline autoPlay loop draggable={false} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={ov.fileName || "overlay"} draggable={false} />
                )}
              </div>
            );
          })}

          {activeClip && (
            <div className="preview-meta">
              <span>#{activeClip.rank}</span>
              <span>
                {clipPlayDuration(activeClip).toFixed(1)}s
                {hasHook
                  ? segIndex === 0
                    ? " · hook"
                    : segments.length > 2
                      ? ` · part ${segIndex}/${segments.length - 1}`
                      : " · main"
                  : segments.length > 1
                    ? ` · part ${segIndex + 1}/${segments.length}`
                    : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="preview-transport">
        <div className="preview-transport-row">
          <button
            type="button"
            className="btn ghost small"
            disabled={sequence.length === 0}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? "Pause" : "Play all"}
          </button>
          <span className="preview-clock">
            {formatTime(absTime)} / {formatTime(totalDur)}
            {sequence.length > 0
              ? ` · clip ${Math.min(activeIndex + 1, sequence.length)}/${sequence.length}`
              : ""}
          </span>
        </div>

        <div className="preview-scrub">
          <input
            type="range"
            min={0}
            max={Math.max(0.1, totalDur || 0.1)}
            step={0.01}
            value={Math.min(absTime, totalDur || 0)}
            disabled={totalDur <= 0}
            onChange={(e) => seekAbsolute(parseFloat(e.target.value))}
            aria-label="Preview timeline"
          />
          <div className="preview-scrub-marks">
            {placements.map((p) => {
              const start = resolveSfxStartAt(p, offsets);
              if (totalDur <= 0) return null;
              const selected = p.id === selectedSfxPlacementId;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`preview-scrub-mark ${selected ? "selected" : ""}`}
                  style={{ left: `${Math.min(100, (start / totalDur) * 100)}%` }}
                  title={`SFX @ ${start.toFixed(2)}s — click to select, Delete to remove`}
                  aria-label={`SFX hit at ${start.toFixed(2)} seconds`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedSfxPlacementId(p.id);
                    setSelectedOverlayId(null);
                    requestSfxTab();
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedSfxPlacementId(p.id);
                    removeSfxPlacement(p.id);
                  }}
                />
              );
            })}
            {overlayPlacements.map((p) => {
              const start = resolveOverlayStartAt(p, offsets);
              if (totalDur <= 0) return null;
              const selected = p.id === selectedOverlayId;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`preview-scrub-mark overlay-scrub-mark ${selected ? "selected" : ""}`}
                  style={{ left: `${Math.min(100, (start / totalDur) * 100)}%` }}
                  title={`${p.kind === "text" ? "Text" : "Object"} @ ${start.toFixed(2)}s`}
                  aria-label={`Overlay at ${start.toFixed(2)} seconds`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedOverlayId(p.id);
                    setSelectedSfxPlacementId(null);
                    requestOverlaysTab();
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeOverlayPlacement(p.id);
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="preview-sfx-drop">
          <Volume2 size={14} className="muted-icon" />
          <select
            className="input"
            value={dropAssetId}
            disabled={assets.length === 0}
            onChange={(e) => setDropAssetId(e.target.value)}
            aria-label="Sound effect to place"
          >
            {assets.length === 0 ? (
              <option value="">Upload an SFX first</option>
            ) : (
              assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fileName}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn primary small"
            disabled={!dropAssetId || totalDur <= 0}
            onClick={dropSfxAtPlayhead}
            title="Place the selected sound at the current preview time"
          >
            <Plus size={14} />
            Add at {formatTime(absTime)}
          </button>
        </div>
        <p className="muted preview-sfx-hint">
          Right-click the preview → Add text / object / SFX at the playhead. Marks sit on
          the middle scrubber — Delete removes the selection.
        </p>
      </div>

      {ctxMenu
        ? createPortal(
            <div
              className="preview-ctx-menu"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
              role="menu"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className="preview-ctx-item"
                role="menuitem"
                onClick={() => openAddOverlayFromMenu("text")}
              >
                <Type size={14} />
                Add text at {formatTime(ctxMenu.time)}
              </button>
              <button
                type="button"
                className="preview-ctx-item"
                role="menuitem"
                onClick={() => openAddOverlayFromMenu("media")}
              >
                <Shapes size={14} />
                Add object at {formatTime(ctxMenu.time)}
              </button>
              <button
                type="button"
                className="preview-ctx-item"
                role="menuitem"
                onClick={openAddSfxFromMenu}
              >
                <Plus size={14} />
                Add SFX at {formatTime(ctxMenu.time)}
              </button>
              {selectedOverlayId ? (
                <button
                  type="button"
                  className="preview-ctx-item danger"
                  role="menuitem"
                  onClick={() => {
                    removeOverlayPlacement(selectedOverlayId);
                    setCtxMenu(null);
                  }}
                >
                  Delete selected overlay
                </button>
              ) : null}
              {selectedSfxPlacementId ? (
                <button
                  type="button"
                  className="preview-ctx-item danger"
                  role="menuitem"
                  onClick={() => {
                    removeSfxPlacement(selectedSfxPlacementId);
                    setCtxMenu(null);
                  }}
                >
                  Delete selected SFX
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      <AddSfxAtTimeModal
        open={addSfxOpen}
        atTime={addSfxAt}
        onClose={() => setAddSfxOpen(false)}
      />
      <AddOverlayAtTimeModal
        open={addOverlayOpen}
        atTime={addOverlayAt}
        initialKind={addOverlayKind}
        onClose={() => setAddOverlayOpen(false)}
      />
    </div>
  );
}
