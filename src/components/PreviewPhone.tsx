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
  const [activeIndex, setActiveIndex] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [dropAssetId, setDropAssetId] = useState<string>("");

  const sequence = useMemo(
    () => getPlaybackOrder(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );
  const offsets = useMemo(
    () => clipTimelineOffsets(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );
  const totalDur = useMemo(
    () => totalTimelineDuration(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );

  const activeClip = previewClip ?? sequence[activeIndex] ?? null;
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

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip?.mediaUrl) {
      setMediaReady(false);
      return;
    }

    setMediaReady(false);
    const url = activeClip.mediaUrl;
    const start = scrubbingRef.current
      ? localTime
      : getClipSegments(activeClip)[0]?.start || 0;

    const syncSrc = (el: HTMLVideoElement | null) => {
      if (!el) return;
      if (el.getAttribute("src") !== url) {
        el.src = url;
        el.load();
      }
    };
    syncSrc(fg);
    syncSrc(bg);

    const onReady = () => {
      setMediaReady(true);
      try {
        fg.currentTime = start;
        if (bg) bg.currentTime = start;
        setLocalTime(start);
      } catch {
        // ignore
      }
    };

    fg.addEventListener("loadeddata", onReady);
    if (fg.readyState >= 2) onReady();
    return () => fg.removeEventListener("loadeddata", onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, activeClip?.mediaUrl]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg) return;

    if (isPlaying && activeClip?.mediaUrl && mediaReady) {
      resetSfxFiring(absTime);
      void fg.play().catch(() => onPlayingChange(false));
      void bg?.play().catch(() => undefined);
    } else {
      fg.pause();
      bg?.pause();
      if (!isPlaying) stopAllSfx();
    }
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

    const onTime = () => {
      if (scrubbingRef.current) return;
      setLocalTime(fg.currentTime);
      if (bg && Math.abs(bg.currentTime - fg.currentTime) > 0.15) {
        bg.currentTime = fg.currentTime;
      }
      if (fg.currentTime >= activeSeg.end - 0.05) {
        if (segIndex < segments.length - 1) {
          const nextSeg = segments[segIndex + 1];
          setSegIndex(segIndex + 1);
          try {
            fg.currentTime = nextSeg.start;
            if (bg) bg.currentTime = nextSeg.start;
          } catch {
            // ignore
          }
          return;
        }
        if (previewClip) {
          fg.pause();
          bg?.pause();
          onPlayingChange(false);
          setSegIndex(0);
          fg.currentTime = segments[0]?.start || 0;
          return;
        }
        const next = activeIndex + 1;
        if (next < sequence.length) {
          setActiveIndex(next);
          setSegIndex(0);
        } else {
          setActiveIndex(0);
          setSegIndex(0);
          onPlayingChange(false);
          firedSfxRef.current.clear();
        }
      }
    };
    fg.addEventListener("timeupdate", onTime);
    return () => fg.removeEventListener("timeupdate", onTime);
  }, [
    activeClip,
    activeSeg,
    activeIndex,
    segIndex,
    segments,
    sequence.length,
    previewClip,
    onPlayingChange,
  ]);

  useEffect(() => {
    if (!previewClip) return;
    setActiveIndex(0);
    setSegIndex(0);
  }, [previewClip]);

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
                    ...(crop ? cropPreviewStyle(crop) : null),
                  }}
                />
              )}
              <video
                ref={videoRef}
                className={fitFill ? "preview-fg fill" : "preview-fg"}
                playsInline
                preload="auto"
                style={crop ? cropPreviewStyle(crop) : undefined}
                onLoadedData={(e) => {
                  e.currentTarget.volume = settings.clipVolume;
                }}
              />
              {!mediaReady && <div className="preview-loading">Loading clip…</div>}
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
            {isPlaying ? "Pause" : "Play"}
          </button>
          <span className="preview-clock">
            {formatTime(absTime)} / {formatTime(totalDur)}
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
