"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Bookmark,
  Plus,
  FolderOpen,
} from "lucide-react";
import {
  clipPlayDuration,
  getPlaybackOrder,
  resolveSfxStartAt,
  resolveOverlayStartAt,
  effectiveSfxVolume,
  effectiveClipVolume,
  getClipSpeed,
  getClipCrop,
  getClipBedMusic,
  getClipPlaybackSegments,
  getClipGapAfter,
  clipTimelineOffsets,
} from "@/lib/defaults";
import { ensureSfxOnServer } from "@/lib/sfxLibrary";
import { renderSnapCaptionPng } from "@/lib/renderSnapOverlay";
import { useEditor } from "@/lib/store";
import {
  channelExportBaseName,
  planChannelExport,
} from "@/lib/channels";
import { saveFilmArchive } from "@/lib/projectHistory";
import { FilmHistoryModal } from "./FilmHistoryModal";

export function TopBar({
  isPlaying,
  onTogglePlay,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const {
    project,
    channelState,
    resetProject,
    setExportSlot,
    saveLayoutAsDefault,
    setActiveChannel,
    addChannel,
    setChannelState,
  } = useEditor();
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
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const readyClips = useMemo(
    () => getPlaybackOrder(project.clips, project.settings.playOrder),
    [project.clips, project.settings.playOrder]
  );

  const totalDuration = readyClips.reduce((sum, c) => sum + clipPlayDuration(c), 0);

  const activeChannel =
    channelState.channels.find((c) => c.slug === channelState.activeSlug) ||
    channelState.channels[0];

  const nextPreviewName = useMemo(() => {
    const planned = planChannelExport(channelState, project.exportSlot);
    return channelExportBaseName(
      planned.slot.channelSlug,
      planned.slot.number,
      planned.slot.version
    );
  }, [channelState, project.exportSlot]);

  useEffect(() => {
    // Ensure default channel folders exist once
    for (const c of channelState.channels) {
      void fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: c.slug, name: c.name }),
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleAddChannel() {
    const slug = await addChannel(newChannelName);
    if (!slug) return;
    setNewChannelName("");
    setAddingChannel(false);
  }

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
      const planned = planChannelExport(channelState, project.exportSlot);
      setChannelState(planned.state);

      const restoredAssets = await Promise.all(
        (project.sfxAssets || []).map((asset) => ensureSfxOnServer(asset))
      );
      const assetById = new Map(restoredAssets.map((a) => [a.id, a]));
      const { settings } = project;

      const offsets = clipTimelineOffsets(project.clips, settings.playOrder).map((o) => ({
        clipId: o.clipId,
        start: o.start,
        duration: o.duration,
      }));
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

      const overlaysForExport: {
        kind: "text" | "media";
        startAt: number;
        duration: number;
        x?: number;
        y?: number;
        scale?: number;
        mediaId?: string | null;
        pngBase64?: string | null;
      }[] = [];
      for (const ov of project.overlayPlacements || []) {
        const startAt = resolveOverlayStartAt(ov, offsets);
        if (ov.kind === "text") {
          try {
            const dataUrl = await renderSnapCaptionPng(ov);
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
            overlaysForExport.push({
              kind: "text",
              startAt,
              duration: ov.duration,
              pngBase64: b64,
            });
          } catch {
            // Skip broken caption rather than failing the whole export
          }
        } else if (ov.mediaId) {
          overlaysForExport.push({
            kind: "media",
            startAt,
            duration: ov.duration,
            x: ov.x,
            y: ov.y,
            scale: ov.scale,
            mediaId: ov.mediaId,
          });
        }
      }

      setProgress(`Rendering ${planned.fileName}…`);
      const titlePayload =
        settings.title.enabled === false
          ? { ...settings.title, showBar: false, lines: [], enabled: false }
          : settings.title;
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: readyClips.map((c) => {
            const playback = getClipPlaybackSegments(c).map((s) => ({
              start: s.start,
              end: s.end,
            }));
            const first = playback[0];
            const last = playback[playback.length - 1];
            return {
              mediaId: c.mediaId,
              rank: c.rank,
              label: c.label,
              trimStart: first?.start ?? c.trimStart,
              trimEnd: last?.end ?? c.trimEnd,
              segments: playback,
              crop: getClipCrop(c),
              // Already includes UI→real scale (100% slider ≈ 20% gain) × master
              volume: effectiveClipVolume(c, settings.clipVolume),
              speed: getClipSpeed(c),
              bedMusic: (() => {
                const bed = getClipBedMusic(c);
                return bed?.mediaId
                  ? {
                      mediaId: bed.mediaId,
                      startAt: bed.startAt,
                      volume: bed.volume,
                    }
                  : null;
              })(),
              gapAfter: getClipGapAfter(c),
            };
          }),
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
          // Per-clip volume already includes master × UI scale
          clipVolume: 1,
          width: settings.width,
          height: settings.height,
          fps: settings.fps,
          sticker: settings.sticker
            ? {
                enabled: settings.sticker.enabled,
                mediaId: settings.sticker.mediaId,
                scale: settings.sticker.scale,
                speed: settings.sticker.speed,
                startAt: settings.sticker.startAt ?? 20,
                duration: settings.sticker.duration ?? 0,
              }
            : null,
          channelExport: {
            channelSlug: planned.slot.channelSlug,
            number: planned.slot.number,
            version: planned.slot.version,
          },
          sfx: sfxForExport,
          overlays: overlaysForExport,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setExportSlot(planned.slot);
      const fileName = data.fileName || planned.fileName;
      const savedPath = data.savedPath || planned.relativePath;
      setProgress(`Saved to ${savedPath}`);
      setSavedExport({ fileName, savedPath });

      // Archive full editor state so this film can be reopened later
      try {
        const projectForArchive = {
          ...project,
          exportSlot: planned.slot,
          sfxAssets: restoredAssets,
        };
        await saveFilmArchive({
          project: projectForArchive,
          reason: "post-export",
          channelSlug: planned.slot.channelSlug,
          channelName: activeChannel?.name,
          number: planned.slot.number,
          version: planned.slot.version,
          label: channelExportBaseName(
            planned.slot.channelSlug,
            planned.slot.number,
            planned.slot.version
          ),
        });
      } catch {
        // Export succeeded; archive is best-effort
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
      setProgress(null);
    } finally {
      setExporting(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        `Clear all clips for a new ${activeChannel?.name || "channel"} video?\n\nYour current film will be saved under Open previous (if it has clips). Channel selector, video counters, and per-channel subscribe stickers are kept. The next export will be a new number (e.g. ranking-${activeChannel?.slug || "animals"}-${channelState.nextNumber[activeChannel?.slug || "animals"] || 1}).`
      )
    ) {
      return;
    }
    try {
      await saveFilmArchive({
        project,
        reason: "pre-reset",
        channelSlug: project.exportSlot?.channelSlug || channelState.activeSlug,
        channelName: activeChannel?.name,
      });
    } catch {
      // Still reset even if archive fails
    }
    resetProject();
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
        <div
          className="channel-picker"
          title="Upload channel — sets export folder, filename, and subscribe sticker"
        >
          <label className="channel-label">
            <span>Channel</span>
            <select
              className="input channel-select"
              value={channelState.activeSlug}
              onChange={(e) => setActiveChannel(e.target.value)}
            >
              {channelState.channels.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {addingChannel ? (
            <div className="channel-add-row">
              <input
                className="input"
                placeholder="New channel name"
                value={newChannelName}
                autoFocus
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddChannel();
                  if (e.key === "Escape") {
                    setAddingChannel(false);
                    setNewChannelName("");
                  }
                }}
              />
              <button
                type="button"
                className="btn ghost small"
                onClick={() => void handleAddChannel()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setAddingChannel(false);
                  setNewChannelName("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setAddingChannel(true)}
              title="Add another upload channel"
            >
              <Plus size={14} /> Channel
            </button>
          )}
          <span className="channel-next muted" title="Next export filename">
            {nextPreviewName}
          </span>
        </div>

        <button
          className="btn ghost"
          onClick={() => {
            saveLayoutAsDefault();
            setLayoutSavedFlash(true);
            window.setTimeout(() => setLayoutSavedFlash(false), 1800);
          }}
          title="Save current title, ranks, look, and music as the default layout for Reset (stickers stay per channel)"
        >
          <Bookmark size={16} />
          {layoutSavedFlash ? "Layout saved" : "Save layout"}
        </button>
        <button
          className="btn ghost"
          onClick={() => setHistoryOpen(true)}
          title="Open a previous film (exports + before-reset snapshots, ~2 months)"
        >
          <FolderOpen size={16} />
          Open previous
        </button>
        <button
          className="btn ghost"
          onClick={() => void handleReset()}
          title="Clear clips for a new video — saves current film first, keeps channel, counters & stickers"
        >
          <RotateCcw size={16} />
          Reset
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
              {savedExport.savedPath}
            </p>
          )}
        </div>
      )}

      <FilmHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </header>
  );
}
