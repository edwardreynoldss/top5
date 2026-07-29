"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import {
  getPlaybackOrder,
  clipPlayDuration,
  displayWord,
  getClipSegments,
  getClipCrop,
  cropPreviewStyle,
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
  const { project } = useEditor();
  const { settings } = project;
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);

  const sequence = useMemo(
    () => getPlaybackOrder(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );

  const activeClip = previewClip ?? sequence[activeIndex] ?? null;
  const segments = useMemo(
    () => (activeClip ? getClipSegments(activeClip) : []),
    [activeClip]
  );
  const activeSeg = segments[segIndex] || segments[0];

  // Load / reload media when clip changes
  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip?.mediaUrl) {
      setMediaReady(false);
      return;
    }

    setMediaReady(false);
    setSegIndex(0);
    const url = activeClip.mediaUrl;
    const start = getClipSegments(activeClip)[0]?.start || 0;

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
      } catch {
        // ignore seek until more data
      }
    };

    fg.addEventListener("loadeddata", onReady);
    if (fg.readyState >= 2) onReady();
    return () => fg.removeEventListener("loadeddata", onReady);
  }, [activeClip]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeSeg) return;

    const seekBoth = () => {
      fg.currentTime = activeSeg.start;
      if (bg) bg.currentTime = activeSeg.start;
    };

    if (mediaReady) seekBoth();
  }, [activeSeg, segIndex, mediaReady]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg) return;

    if (isPlaying && activeClip?.mediaUrl && mediaReady) {
      void fg.play().catch(() => onPlayingChange(false));
      void bg?.play().catch(() => undefined);
    } else {
      fg.pause();
      bg?.pause();
    }
  }, [isPlaying, activeClip?.id, activeClip?.mediaUrl, mediaReady, onPlayingChange, segIndex]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip || !activeSeg) return;

    const onTime = () => {
      setLocalTime(fg.currentTime);
      if (bg && Math.abs(bg.currentTime - fg.currentTime) > 0.15) {
        bg.currentTime = fg.currentTime;
      }
      if (fg.currentTime >= activeSeg.end - 0.05) {
        // Next segment in this clip?
        if (segIndex < segments.length - 1) {
          setSegIndex(segIndex + 1);
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
    if (!previewClip) {
      setActiveIndex(0);
      setSegIndex(0);
    }
  }, [previewClip, sequence]);

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
  const previewBarH = title.showBar ? barHeightPx : titleFontPx * title.lines.length + 16;
  const videoTop = titleOverlap ? 0 : previewBarH;

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

          {title.showBar && (
            <div
              className="title-bar-bg"
              style={{
                background: `rgba(0,0,0,${title.barOpacity})`,
                height: `${barHeightPx}px`,
              }}
            />
          )}

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
                {localTime > 0 ? ` · ${localTime.toFixed(1)}s` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
