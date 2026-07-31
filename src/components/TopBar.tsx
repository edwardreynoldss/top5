"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, Pause, RotateCcw, Bookmark } from "lucide-react";
import { clipPlayDuration, getPlaybackOrder, resolveSfxStartAt, effectiveSfxVolume, getClipVolume } from "@/lib/defaults";
import { ensureSfxOnServer } from "@/lib/sfxLibrary";
import { useEditor } from "@/lib/store";

export function TopBar({
  isPlaying,
  onTogglePlay,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const { project, resetProject, saveLayoutAsDefault } = useEditor();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [savedExport, setSavedExport] = useState<{
    fileName: string;
    savedPath: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolsOk, setToolsOk] = useState<boolean | null>(null);
  const [toolsHint, setToolsHint] = useState<string | null>(null);
  const [layoutSavedFlash, setLayoutSavedFlash] = useState(false);

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
            .filter(([k, v]) => k !== "pillow" && !(v as { ok?: boolean }).ok)
            .map(([k]) => k);
          const pillowHint =
            data.pillowReady === false
              ? " Pillow will auto-install on export (or run: python -m pip install pillow)."
              : "";
          setToolsHint(
            missing.length
              ? `Missing tools: ${missing.join(", ")}. Windows: winget install Gyan.FFmpeg yt-dlp.yt-dlp Python.Python.3.12 then python -m pip install pillow yt-dlp`
              : pillowHint.trim() || null
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
    setSavedExport(null);
    setProgress("Preparing sound effects…");
    try {
      // Re-upload any SFX that vanished from tmp/ but still live in IndexedDB
      const restoredAssets = [];
      for (const asset of project.sfxAssets || []) {
        restoredAssets.push(await ensureSfxOnServer(asset));
      }
      const assetById = new Map(restoredAssets.map((a) => [a.id, a]));

      let t = 0;
      const offsets = readyClips.map((c) => {
        const duration = clipPlayDuration(c);
        const row = { clipId: c.id, start: t, duration };
        t += duration;
        return row;
      });
      const sfxForExport = (project.sfxPlacements || [])
        .map((p) => {
          const asset = assetById.get(p.assetId);
          if (!asset) return null;
          return {
            mediaId: asset.mediaId,
            startAt: resolveSfxStartAt(p, offsets),
            trimStart: p.trimStart,
            trimEnd: p.trimEnd,
            volume: effectiveSfxVolume(asset.volume, p.volume),
          };
        })
        .filter(Boolean);

      setProgress("Rendering vertical segments…");
      const { settings } = project;
      const titlePayload =
        settings.title.enabled === false
          ? { ...settings.title, showBar: false, lines: [], enabled: false }
          : settings.title;
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
            segments: (c.segments?.length
              ? c.segments
              : [{ start: c.trimStart, end: c.trimEnd }]
            ).map((s) => ({ start: s.start, end: s.end })),
            crop: c.crop || { zoom: 1, panX: 50, panY: 50 },
            volume: getClipVolume(c),
          })),
          title: titlePayload,
          ranksLayout: settings.ranksLayout,
          playOrder: settings.playOrder,
          transition: settings.transition,
          transitionDuration: settings.transitionDuration,
          aspectMode: settings.aspectMode,
          blurAmount: settings.blurAmount,
          titleOverlap: settings.title.enabled === false ? true : settings.titleOverlap,
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
          sfx: sfxForExport,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      const fileName = data.fileName || "ranking-short.mp4";
      const savedPath = data.savedPath || `exports/${fileName}`;
      setProgress(`Saved to ${savedPath}`);
      setSavedExport({
        fileName,
        savedPath,
      });
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
        <button
          className="btn ghost"
          onClick={() => {
            saveLayoutAsDefault();
            setLayoutSavedFlash(true);
            window.setTimeout(() => setLayoutSavedFlash(false), 1800);
          }}
          title="Save current title, ranks, and look as the default layout for Reset"
        >
          <Bookmark size={16} />
          {layoutSavedFlash ? "Layout saved" : "Save layout"}
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            if (
              window.confirm(
                "Clear all clips and placements? Your saved default layout (title/ranks/look) will be kept."
              )
            ) {
              resetProject();
            }
          }}
          title="Clear clips — keeps your saved default layout"
        >
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

      {(progress || error || savedExport || toolsHint) && (
        <div className="export-toast">
          {toolsHint && !error && <p className="error-text">{toolsHint}</p>}
          {error && <p className="error-text">{error}</p>}
          {progress && !error && <p>{progress}</p>}
          {savedExport && !error && (
            <p className="muted export-saved-path" title={savedExport.savedPath}>
              {savedExport.fileName}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
