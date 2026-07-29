"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, Pause, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/store";
import { clipPlayDuration, getPlaybackOrder } from "@/lib/defaults";

export function TopBar({
  isPlaying,
  onTogglePlay,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const { project, resetProject } = useEditor();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolsOk, setToolsOk] = useState<boolean | null>(null);
  const [toolsHint, setToolsHint] = useState<string | null>(null);

  const readyClips = useMemo(
    () => getPlaybackOrder(project.clips, project.settings.playOrder),
    [project.clips, project.settings.playOrder]
  );

  const totalDuration = readyClips.reduce((sum, c) => sum + clipPlayDuration(c), 0);

  useEffect(() => {
    void fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setToolsOk(Boolean(data.ok));
        if (!data.ok) {
          const missing = Object.entries(data.tools || {})
            .filter(([, v]) => !(v as { ok?: boolean }).ok)
            .map(([k]) => k);
          setToolsHint(
            `Missing tools: ${missing.join(", ")}. macOS: brew install ffmpeg yt-dlp && pip install pillow`
          );
        } else {
          setToolsHint(null);
        }
      })
      .catch(() => {
        setToolsOk(null);
      });
  }, []);

  async function exportVideo() {
    if (readyClips.length === 0) {
      setError("Add and trim at least one clip first.");
      return;
    }
    setExporting(true);
    setError(null);
    setDownloadUrl(null);
    setProgress("Rendering vertical segments…");
    try {
      const { settings } = project;
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: readyClips.map((c) => ({
            mediaId: c.mediaId,
            rank: c.rank,
            label: c.label,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
          })),
          title: settings.title,
          ranksLayout: settings.ranksLayout,
          playOrder: settings.playOrder,
          transition: settings.transition,
          transitionDuration: settings.transitionDuration,
          aspectMode: settings.aspectMode,
          blurAmount: settings.blurAmount,
          showRankList: settings.showRankList,
          showActiveLabel: settings.showActiveLabel,
          rankColors: Object.fromEntries(
            Object.entries(settings.rankColors).map(([k, v]) => [String(k), v])
          ),
          musicMediaId: settings.musicMediaId,
          musicVolume: settings.musicVolume,
          clipVolume: settings.clipVolume,
          width: settings.width,
          height: settings.height,
          fps: settings.fps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setProgress("Done");
      setDownloadUrl(data.downloadUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
      setProgress(null);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">RS</span>
        <div>
          <strong>RankShorts</strong>
          <p>Top-5 ranking Shorts editor</p>
        </div>
      </div>

      <div className="topbar-meta">
        <span
          className={`tool-pill ${toolsOk === false ? "bad" : toolsOk ? "good" : ""}`}
          title={toolsHint || "Checking ffmpeg / yt-dlp"}
        >
          {toolsOk === false ? "Tools missing" : toolsOk ? "Tools OK" : "Checking tools…"}
        </span>
        <span>{readyClips.length}/5 clips</span>
        <span>{totalDuration.toFixed(1)}s</span>
        <span>1080×1920</span>
      </div>

      <div className="topbar-actions">
        <button className="btn ghost" onClick={resetProject} title="Reset project">
          <RotateCcw size={16} />
        </button>
        <button className="btn" onClick={onTogglePlay} disabled={readyClips.length === 0}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? "Pause" : "Preview"}
        </button>
        <button className="btn primary" onClick={exportVideo} disabled={exporting}>
          {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
          {exporting ? "Exporting…" : "Export MP4"}
        </button>
      </div>

      {(progress || error || downloadUrl || toolsHint) && (
        <div className="export-toast">
          {toolsHint && !error && <p className="error-text">{toolsHint}</p>}
          {error && <p className="error-text">{error}</p>}
          {progress && !error && <p>{progress}</p>}
          {downloadUrl && (
            <a className="btn primary small" href={downloadUrl} download="ranking-short.mp4">
              <Download size={14} /> Download video
            </a>
          )}
        </div>
      )}
    </header>
  );
}
