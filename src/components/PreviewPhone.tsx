"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Plus, Volume2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  getPlaybackOrder,
  clipPlayDuration,
  displayWord,
  getClipSegments,
  getClipCrop,
  cropPreviewStyle,
  clipTimelineOffsets,
  totalTimelineDuration,
  resolveSfxStartAt,
  clipLocalPlayProgress,
  sourceSeekFromLocalPlay,
  absoluteTimeForClipPlayhead,
  findClipAtAbsoluteTime,
  formatTime,
  effectiveSfxVolume,
} from "@/lib/defaults";
import { fontCss, type RankClip } from "@/lib/types";

export function PreviewPhone({
  previewClip,
  isPlaying,
  onPlayingChange,
}: {
  previewClip?: RankClip | null;
  isPlaying: boolean;
  onPlayingChange: (v: boolean) => void;
}) {
  const {
    project,
    addSfxPlacement,
    setSelectedSfxPlacementId,
    setSelectedClipId,
    requestSfxTab,
  } = useEditor();
  const { settings } = project;
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgRef = useRef<HTMLVideoElement>(null);
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
  isPlayingRef.current = isPlaying;
  activeIndexRef.current = activeIndex;
  segIndexRef.current = segIndex;

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
    () => (activeClip ? getClipSegments(activeClip) : []),
    [activeClip]
  );
  const activeSeg = segments[segIndex] || segments[0];
  const assets = useMemo(() => project.sfxAssets || [], [project.sfxAssets]);
  const placements = useMemo(() => project.sfxPlacements || [], [project.sfxPlacements]);

  const localPlay = useMemo(() => {
    if (!activeClip) return 0;
    return clipLocalPlayProgress(activeClip, segIndex, localTime);
  }, [activeClip, segIndex, localTime]);

  const absTime = useMemo(() => {
    if (!activeClip) return 0;
    return absoluteTimeForClipPlayhead(activeClip.id, localPlay, offsets);
  }, [activeClip, localPlay, offsets]);

  useEffect(() => {
    if (!dropAssetId && assets[0]?.id) setDropAssetId(assets[0].id);
  }, [assets, dropAssetId]);

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
    firedSfxRef.current = new Set(
      placements
        .filter((p) => resolveSfxStartAt(p, offsets) < fromAbs - 0.02)
        .map((p) => p.id)
    );
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

    const url = activeClip.mediaUrl;
    const start = scrubbingRef.current
      ? localTime
      : getClipSegments(activeClip)[0]?.start || 0;

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

  useEffect(() => {
    if (!isPlaying || totalDur <= 0) return;
    for (const p of placements) {
      const start = resolveSfxStartAt(p, offsets);
      if (absTime + 0.05 < start || absTime > start + 0.25) continue;
      if (firedSfxRef.current.has(p.id)) continue;
      const asset = assets.find((a) => a.id === p.assetId);
      if (!asset?.mediaUrl) continue;
      firedSfxRef.current.add(p.id);
      const audio = new Audio(asset.mediaUrl);
      audio.volume = Math.min(1, Math.max(0, effectiveSfxVolume(asset.volume, p.volume)));
      try {
        audio.currentTime = p.trimStart;
      } catch {
        // ignore
      }
      const stopAt = p.trimEnd;
      const onAudioTime = () => {
        if (audio.currentTime >= stopAt - 0.03) {
          audio.pause();
          audio.removeEventListener("timeupdate", onAudioTime);
        }
      };
      audio.addEventListener("timeupdate", onAudioTime);
      activeSfxRef.current.push(audio);
      void audio.play().catch(() => undefined);
    }
  }, [absTime, isPlaying, placements, assets, offsets, totalDur]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip || !activeSeg) return;

    const segEnd = activeSeg.end;
    const segStart = activeSeg.start;

    const completeCurrent = () => {
      if (scrubbingRef.current || advancingRef.current) return;
      if (!isPlayingRef.current) return;

      // Next trim part within the same ranking clip
      if (segIndexRef.current < segments.length - 1) {
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

      // Advance to next ranking clip
      advancingRef.current = true;
      const seq = sequenceRef.current;
      const next = activeIndexRef.current + 1;
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
          const start = first ? getClipSegments(first)[0]?.start || 0 : 0;
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
  ]);

  // previewClip prop kept for API compatibility; preview always plays the full sequence
  void previewClip;

  function seekAbsolute(t: number) {
    if (offsets.length === 0 || sequence.length === 0) return;
    const clamped = Math.max(0, Math.min(t, Math.max(0, totalDur - 0.05)));
    const hit = findClipAtAbsoluteTime(clamped, offsets);
    if (!hit) return;
    const clip = sequence.find((c) => c.id === hit.clipId);
    if (!clip) return;
    const local = clamped - hit.start;
    const { segIndex: si, sourceTime } = sourceSeekFromLocalPlay(clip, local);

    setSelectedClipId(null);
    onPlayingChange(false);
    stopAllSfx();
    resetSfxFiring(clamped);

    const idx = sequence.findIndex((c) => c.id === clip.id);
    scrubbingRef.current = true;
    setActiveIndex(Math.max(0, idx));
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
        fg.currentTime = sourceTime;
        if (bg) bg.currentTime = sourceTime;
      } catch {
        // ignore
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
    if (id) {
      setSelectedSfxPlacementId(id);
      requestSfxTab();
    }
  }

  function togglePlay() {
    if (!isPlaying) {
      setSelectedClipId(null);
      if (totalDur > 0 && absTime >= totalDur - 0.08) {
        const clip = sequence[0];
        if (clip) {
          const start = getClipSegments(clip)[0]?.start || 0;
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
        <div className="preview-stage">
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
                  e.currentTarget.volume = settings.clipVolume;
                  const v = e.currentTarget;
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoAspect(v.videoWidth / v.videoHeight);
                  }
                }}
              />
              {!mediaReady && <div className="preview-loading">Loading clip…</div>}
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
                return (
                  <div
                    key={c.id}
                    className={`rank-row ${isActive ? "active" : ""}`}
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
                    {settings.showActiveLabel && isActive && c.label ? (
                      <span className="rank-label" style={{ fontSize: `${labelFontPx}px` }}>
                        {c.label.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {activeClip && (
            <div className="preview-meta">
              <span>#{activeClip.rank}</span>
              <span>
                {clipPlayDuration(activeClip).toFixed(1)}s
                {segments.length > 1 ? ` · part ${segIndex + 1}/${segments.length}` : ""}
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
          <div className="preview-scrub-marks" aria-hidden>
            {placements.map((p) => {
              const start = resolveSfxStartAt(p, offsets);
              if (totalDur <= 0) return null;
              return (
                <span
                  key={p.id}
                  className="preview-scrub-mark"
                  style={{ left: `${Math.min(100, (start / totalDur) * 100)}%` }}
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
          Scrub or pause on the exact moment, add an SFX, then tweak trim/volume in the SFX tab.
        </p>
      </div>
    </div>
  );
}
