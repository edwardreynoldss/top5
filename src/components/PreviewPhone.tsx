"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { getPlaybackOrder, clipPlayDuration } from "@/lib/defaults";
import type { RankClip } from "@/lib/types";

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
  const [localTime, setLocalTime] = useState(0);

  const sequence = useMemo(
    () => getPlaybackOrder(project.clips, settings.playOrder),
    [project.clips, settings.playOrder]
  );

  const activeClip = previewClip ?? sequence[activeIndex] ?? null;

  // Keep bg and fg videos in sync
  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip?.mediaUrl) return;

    const onMeta = () => {
      fg.currentTime = activeClip.trimStart;
      if (bg) bg.currentTime = activeClip.trimStart;
    };
    fg.addEventListener("loadedmetadata", onMeta);
    if (fg.readyState >= 1) onMeta();
    return () => fg.removeEventListener("loadedmetadata", onMeta);
  }, [activeClip?.id, activeClip?.mediaUrl, activeClip?.trimStart]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg) return;

    if (isPlaying && activeClip?.mediaUrl) {
      void fg.play().catch(() => onPlayingChange(false));
      void bg?.play().catch(() => undefined);
    } else {
      fg.pause();
      bg?.pause();
    }
  }, [isPlaying, activeClip?.id, activeClip?.mediaUrl, onPlayingChange]);

  useEffect(() => {
    const fg = videoRef.current;
    const bg = bgRef.current;
    if (!fg || !activeClip) return;

    const onTime = () => {
      setLocalTime(fg.currentTime);
      if (bg && Math.abs(bg.currentTime - fg.currentTime) > 0.12) {
        bg.currentTime = fg.currentTime;
      }
      if (fg.currentTime >= activeClip.trimEnd - 0.05) {
        if (previewClip) {
          fg.pause();
          bg?.pause();
          onPlayingChange(false);
          fg.currentTime = activeClip.trimStart;
          return;
        }
        // Advance sequence
        const next = activeIndex + 1;
        if (next < sequence.length) {
          setActiveIndex(next);
        } else {
          setActiveIndex(0);
          onPlayingChange(false);
        }
      }
    };
    fg.addEventListener("timeupdate", onTime);
    return () => fg.removeEventListener("timeupdate", onTime);
  }, [
    activeClip,
    activeIndex,
    sequence.length,
    previewClip,
    onPlayingChange,
  ]);

  useEffect(() => {
    if (!previewClip) setActiveIndex(0);
  }, [previewClip, sequence]);

  const title = settings.title;
  const ranksToShow = useMemo(() => {
    const ordered =
      settings.playOrder === "countdown"
        ? [...project.clips].sort((a, b) => b.rank - a.rank)
        : [...project.clips].sort((a, b) => a.rank - b.rank);
    return ordered;
  }, [project.clips, settings.playOrder]);

  return (
    <div className="preview-shell">
      <div className="preview-phone">
        <div className="preview-stage">
          {activeClip?.mediaUrl ? (
            <>
              {settings.aspectMode === "blur-pad" && (
                <video
                  ref={bgRef}
                  className="preview-bg"
                  src={activeClip.mediaUrl}
                  muted
                  playsInline
                  style={{ filter: `blur(${settings.blurAmount}px) saturate(1.1)` }}
                />
              )}
              <video
                ref={videoRef}
                className={
                  settings.aspectMode === "blur-pad" ? "preview-fg" : "preview-fg fill"
                }
                src={activeClip.mediaUrl}
                playsInline
                onLoadedData={(e) => {
                  e.currentTarget.volume = settings.clipVolume;
                }}
              />
            </>
          ) : (
            <div className="preview-empty">
              <p>Add clips to preview your ranking Short</p>
            </div>
          )}

          <div
            className="title-bar"
            style={{ background: `rgba(0,0,0,${title.barOpacity})` }}
          >
            <span className="title-text">
              {title.prefix && <span>{title.prefix.toUpperCase()} </span>}
              {title.highlight && (
                <span style={{ color: title.highlightColor }}>
                  {title.highlight.toUpperCase()}
                </span>
              )}
              {title.suffix && <span> {title.suffix.toUpperCase()}</span>}
            </span>
          </div>

          {settings.showRankList && (
            <div className="rank-list">
              {ranksToShow.map((clip) => {
                const isActive = activeClip?.rank === clip.rank;
                return (
                  <div key={clip.id} className={`rank-row ${isActive ? "active" : ""}`}>
                    <span
                      className="rank-num"
                      style={{ color: settings.rankColors[clip.rank] || "#fff" }}
                    >
                      {clip.rank}.
                    </span>
                    {settings.showActiveLabel && isActive && clip.label ? (
                      <span className="rank-label">{clip.label.toUpperCase()}</span>
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
                {clipPlayDuration(activeClip).toFixed(1)}s ·{" "}
                {localTime > 0 ? localTime.toFixed(1) : activeClip.trimStart.toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
