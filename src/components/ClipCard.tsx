"use client";

import { useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Link2,
  Upload,
  Scissors,
  Trash2,
  Loader2,
  X,
  Volume2,
  Gauge,
  Wind,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { ClipBedMusic, ClipCrop, ClipHook, RankClip, TrimSegment } from "@/lib/types";
import { TrimModal } from "./TrimModal";
import { DEFAULT_CLIP_DURATION } from "@/lib/types";
import {
  createSegment,
  getClipMainSegments,
  getClipHook,
  hookDuration,
  clipPlayDuration,
  clipShortText,
  defaultCrop,
  normalizeCrop,
  normalizeBedMusic,
  normalizeHook,
  getClipCrop,
  getClipBedMusic,
  getClipTransitionVolume,
  getPlaybackOrder,
  getClipVolume,
  getClipSpeed,
  getSegmentSpeed,
  clampClipSpeed,
  cropPreviewStyle,
} from "@/lib/defaults";

function isVideoFile(file: File) {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name);
}

function pickVideoFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt?.files?.length) return null;
  for (const file of Array.from(dt.files)) {
    if (isVideoFile(file)) return file;
  }
  return null;
}

export function ClipCard({ clip }: { clip: RankClip }) {
  const { updateClip, selectedClipId, setSelectedClipId, project } = useEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id });
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepthRef = useRef(0);
  const [url, setUrl] = useState(clip.sourceUrl || "");
  const [trimOpen, setTrimOpen] = useState(false);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<{
    mediaId: string;
    mediaUrl: string;
    duration: number;
    fileName: string;
    sourceUrl?: string | null;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [thumbAspect, setThumbAspect] = useState(9 / 16);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const color = project.settings.rankColors[clip.rank] || "#fff";
  const busy = clip.status === "loading";
  const inDepth = project.settings.inDepthRanking === true;
  const afterText = clipShortText(clip);
  const clipCrop = getClipCrop(clip);
  const thumbLayout = cropPreviewStyle(clipCrop, {
    frameAspect: 9 / 16,
    videoAspect: thumbAspect,
  });

  function cancelIngest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    updateClip(clip.id, { status: "empty", error: undefined });
  }

  async function ingestUpload(file: File) {
    if (!isVideoFile(file)) {
      updateClip(clip.id, {
        status: "error",
        error: "Drop a video file (mp4, mov, webm, mkv…)",
      });
      return;
    }
    cancelIngest();
    const ac = new AbortController();
    abortRef.current = ac;
    updateClip(clip.id, { status: "loading", error: undefined });
    setProgress(`Uploading ${Math.round(file.size / 1024 / 1024)}MB…`);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd, signal: ac.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPendingMeta({
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        duration: data.duration,
        fileName: data.fileName,
      });
      setPendingSrc(data.mediaUrl);
      setTrimOpen(true);
      updateClip(clip.id, { status: "empty" });
      setProgress(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        updateClip(clip.id, { status: "empty", error: undefined });
        setProgress(null);
        return;
      }
      updateClip(clip.id, {
        status: "error",
        error: e instanceof Error ? e.message : "Upload failed",
      });
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }

  function onFileDragEnter(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setFileDragOver(true);
  }

  function onFileDragOver(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setFileDragOver(true);
  }

  function onFileDragLeave(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setFileDragOver(false);
  }

  function onFileDrop(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setFileDragOver(false);
    if (busy) return;
    const file = pickVideoFromDataTransfer(e.dataTransfer);
    if (!file) {
      updateClip(clip.id, {
        status: clip.status === "ready" ? "ready" : "error",
        error: "Drop a video file (mp4, mov, webm, mkv…)",
      });
      return;
    }
    setSelectedClipId(clip.id);
    void ingestUpload(file);
  }

  async function ingestUrl() {
    if (!url.trim()) return;
    cancelIngest();
    const ac = new AbortController();
    abortRef.current = ac;
    updateClip(clip.id, { status: "loading", error: undefined, sourceUrl: url.trim() });
    setProgress("Fetching link…");
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail ? `${data.error}\n${data.detail}` : data.error || "Download failed");
      }
      setPendingMeta({
        mediaId: data.mediaId,
        mediaUrl: data.mediaUrl,
        duration: data.duration,
        fileName: data.fileName,
        sourceUrl: data.sourceUrl,
      });
      setPendingSrc(data.mediaUrl);
      setTrimOpen(true);
      updateClip(clip.id, { status: "empty" });
      setProgress(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        updateClip(clip.id, { status: "empty", error: undefined });
        setProgress(null);
        return;
      }
      updateClip(clip.id, {
        status: "error",
        error: e instanceof Error ? e.message : "Download failed",
      });
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }

  function confirmTrim(
    segments: TrimSegment[],
    crop: ClipCrop,
    bedMusic?: ClipBedMusic,
    hook?: ClipHook,
    muteLookMusic?: boolean
  ) {
    if (!pendingMeta && !clip.mediaUrl) return;
    const meta = pendingMeta;
    const first = segments[0];
    const last = segments[segments.length - 1];
    const sourceDur = meta?.duration ?? clip.duration;
    const partSpeeds = segments.map((s) =>
      clampClipSpeed(typeof s.speed === "number" ? s.speed : getClipSpeed(clip))
    );
    const syncedSpeed = partSpeeds[0] ?? getClipSpeed(clip);
    updateClip(clip.id, {
      status: "ready",
      mediaId: meta?.mediaId ?? clip.mediaId,
      mediaUrl: meta?.mediaUrl ?? clip.mediaUrl,
      fileName: meta?.fileName ?? clip.fileName,
      sourceUrl: meta?.sourceUrl ?? clip.sourceUrl,
      duration: sourceDur,
      segments,
      crop: normalizeCrop(crop),
      bedMusic: normalizeBedMusic(bedMusic),
      muteLookMusic: muteLookMusic === true,
      hook: normalizeHook(hook, sourceDur || Infinity),
      trimStart: first?.start ?? 0,
      trimEnd: last?.end ?? DEFAULT_CLIP_DURATION,
      speed: syncedSpeed,
      error: undefined,
    });
    setTrimOpen(false);
    setPendingSrc(null);
    setPendingMeta(null);
    setSelectedClipId(clip.id);
  }

  function clearClip() {
    cancelIngest();
    updateClip(clip.id, {
      status: "empty",
      mediaId: null,
      mediaUrl: null,
      fileName: null,
      sourceUrl: null,
      duration: 0,
      trimStart: 0,
      trimEnd: DEFAULT_CLIP_DURATION,
      segments: [createSegment(0, DEFAULT_CLIP_DURATION)],
      crop: defaultCrop(),
      volume: 1,
      speed: 1,
      bedMusic: undefined,
      muteLookMusic: false,
      hook: undefined,
      gapAfter: 0,
      hookGapAfter: 0,
      error: undefined,
    });
    setUrl("");
  }

  const segs = getClipMainSegments(clip);
  const clipHook = getClipHook(clip);
  const clipVol = getClipVolume(clip);
  const clipSpeed = getClipSpeed(clip);
  const partSpeeds = segs.map((s) => getSegmentSpeed(clip, s));
  const speedMixed =
    partSpeeds.length > 1 &&
    partSpeeds.some((s) => Math.abs(s - partSpeeds[0]) > 0.001);
  const speedSliderValue = speedMixed ? partSpeeds[0] : clipSpeed;
  const clipBed = getClipBedMusic(clip);
  const clipTransitionVol = getClipTransitionVolume(clip);
  const transitionSoundOn = project.settings.transitionSound?.enabled !== false;
  // The final clip has no handoff, so it never plays a whoosh
  const playbackOrder = getPlaybackOrder(project.clips, project.settings);
  const isLastInPlayback =
    playbackOrder.length > 0 &&
    playbackOrder[playbackOrder.length - 1]?.id === clip.id;

  // New ingest (upload/fetch) uses pendingMeta → fresh trim defaults.
  // Re-edit (scissors) only sets pendingSrc so existing trim/crop are kept.
  const trimSrc = pendingSrc || "";
  const trimDuration = pendingMeta?.duration || clip.duration || 0;
  const isNewIngest = !!pendingMeta;
  const trimSegments = useMemo(() => {
    if (isNewIngest && pendingMeta) {
      return [
        createSegment(
          0,
          Math.min(DEFAULT_CLIP_DURATION, pendingMeta.duration || DEFAULT_CLIP_DURATION)
        ),
      ];
    }
    return getClipMainSegments(clip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isNewIngest,
    pendingMeta?.mediaId,
    pendingMeta?.duration,
    clip.id,
    clip.segments,
    clip.trimStart,
    clip.trimEnd,
  ]);
  const trimCrop = useMemo(() => {
    if (isNewIngest) return defaultCrop();
    return getClipCrop(clip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewIngest, pendingMeta?.mediaId, clip.id, clip.crop]);
  const trimBedMusic = useMemo(() => {
    if (isNewIngest) return undefined;
    return getClipBedMusic(clip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewIngest, pendingMeta?.mediaId, clip.id, clip.bedMusic]);
  const trimHook = useMemo(() => {
    if (isNewIngest) return undefined;
    return getClipHook(clip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewIngest, pendingMeta?.mediaId, clip.id, clip.hook]);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`clip-card ${selectedClipId === clip.id ? "selected" : ""} ${
          fileDragOver ? "file-drop-target" : ""
        }`}
        onClick={() => setSelectedClipId(clip.id)}
        onDragEnter={onFileDragEnter}
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onFileDrop}
      >
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Reorder">
          <GripVertical size={16} />
        </button>

        <div className="clip-rank" style={{ color }}>
          {clip.rank}
        </div>

        <div className="clip-body">
          <div className="clip-top">
            <input
              className="input label-input"
              placeholder="Name (e.g. Cat Running)"
              value={clip.label}
              onChange={(e) => updateClip(clip.id, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            <label
              className="clip-score"
              title="Ranking added after the name once this clip has played"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className="input"
                placeholder="8.11"
                inputMode="decimal"
                value={clip.score || ""}
                aria-label={`Ranking out of 10 for rank ${clip.rank}`}
                onChange={(e) => updateClip(clip.id, { score: e.target.value })}
              />
              <span>/10</span>
            </label>
            {clip.status === "ready" && (
              <div className="clip-actions">
                <button
                  className="icon-btn"
                  title="Edit trim & crop"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Re-edit: keep saved trim/crop — do not set pendingMeta (that path is new ingest)
                    setPendingMeta(null);
                    setPendingSrc(clip.mediaUrl);
                    setTrimOpen(true);
                  }}
                >
                  <Scissors size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearClip();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <label className="field clip-description" onClick={(e) => e.stopPropagation()}>
            <span>Description — shows while this clip plays</span>
            <input
              className="input"
              placeholder="This Cat does NOT care 😂"
              value={clip.inDepthText || ""}
              onChange={(e) => updateClip(clip.id, { inDepthText: e.target.value })}
            />
          </label>
          {inDepth && afterText ? (
            <p className="muted clip-after-hint">
              After it plays: “{clip.rank}. {afterText}”
            </p>
          ) : null}

          {fileDragOver && (
            <div className="clip-drop-overlay" aria-hidden>
              <Upload size={18} />
              <span>{busy ? "Busy…" : "Drop video to fill this clip"}</span>
            </div>
          )}

          {clip.status === "ready" ? (
            <div className="clip-ready-wrap">
              <div className="clip-ready">
                <div className="thumb" aria-hidden>
                  <div className="crop-content-window" style={thumbLayout.windowStyle}>
                    <div className="crop-pad-content" style={thumbLayout.contentStyle}>
                      <video
                        key={clip.mediaUrl || clip.id}
                        src={`${clip.mediaUrl!}#t=${segs[0]?.start || 0}`}
                        muted
                        playsInline
                        preload="metadata"
                        style={thumbLayout.videoStyle}
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget;
                          if (v.videoWidth > 0 && v.videoHeight > 0) {
                            setThumbAspect(v.videoWidth / v.videoHeight);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="clip-meta">
                  <p className="truncate">{clip.fileName || "Clip ready"}</p>
                  <p className="muted">
                    {segs.length} part{segs.length > 1 ? "s" : ""} ·{" "}
                    {clipPlayDuration(clip).toFixed(1)}s
                    {clipHook
                      ? ` · hook ${hookDuration(clipHook).toFixed(1)}s`
                      : ""}
                    {clipSpeed !== 1 ? ` · ${clipSpeed.toFixed(2)}×` : ""}
                    {clipCrop.zoom !== 1
                      ? ` · ${clipCrop.zoom.toFixed(1)}× zoom`
                      : ""}
                    {Math.abs(clipCrop.panX - 50) > 1 ||
                    Math.abs(clipCrop.panY - 50) > 1
                      ? ` · moved`
                      : ""}
                    {(clipCrop.cropTop || 0) > 0.001 ||
                    (clipCrop.cropBottom || 0) > 0.001 ||
                    (clipCrop.cropLeft || 0) > 0.001 ||
                    (clipCrop.cropRight || 0) > 0.001
                      ? ` · edge cropped`
                      : ""}
                    {clipBed?.fileName ? ` · bed ${clipBed.fileName}` : ""}
                    {clip.muteLookMusic ? ` · look BGM off` : ""}
                    {" · drop a new video to replace"}
                  </p>
                </div>
              </div>
              <div className="clip-controls" onClick={(e) => e.stopPropagation()}>
                <label
                  className="clip-volume"
                  title={
                    speedMixed
                      ? "Parts have different speeds — drag to set all, or open Trim for each part"
                      : segs.length > 1
                        ? "Speed for all parts (edit per-part in Trim)"
                        : "Speed for this clip"
                  }
                >
                  <Gauge size={14} className="muted-icon" />
                  <span>
                    {speedMixed ? "mix" : `${speedSliderValue.toFixed(2)}×`}
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={speedSliderValue}
                    aria-label={`Speed for rank ${clip.rank}`}
                    onChange={(e) => {
                      const speed = clampClipSpeed(parseFloat(e.target.value) || 1);
                      updateClip(clip.id, {
                        speed,
                        segments: segs.map((s) => ({ ...s, speed })),
                      });
                    }}
                  />
                </label>
                <label className="clip-volume" title="Volume for this clip">
                  <Volume2 size={14} className="muted-icon" />
                  <span>{Math.round(clipVol * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={clipVol}
                    aria-label={`Volume for rank ${clip.rank}`}
                    onChange={(e) =>
                      updateClip(clip.id, {
                        volume: Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
                {transitionSoundOn && !isLastInPlayback ? (
                  <label
                    className="clip-volume"
                    title="Whoosh level as this clip hands off to the next (0% skips it)"
                  >
                    <Wind size={14} className="muted-icon" />
                    <span>{Math.round(clipTransitionVol * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={clipTransitionVol}
                      aria-label={`Transition whoosh volume for rank ${clip.rank}`}
                      onChange={(e) =>
                        updateClip(clip.id, {
                          transitionVolume: Math.max(
                            0,
                            Math.min(2, parseFloat(e.target.value) || 0)
                          ),
                        })
                      }
                    />
                  </label>
                ) : null}
                <label
                  className="field check clip-mute-look"
                  title="Silence Look background music while this clip plays (resumes after)"
                >
                  <input
                    type="checkbox"
                    checked={clip.muteLookMusic === true}
                    onChange={(e) =>
                      updateClip(clip.id, { muteLookMusic: e.target.checked })
                    }
                  />
                  <span>Skip look BGM</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="clip-import" onClick={(e) => e.stopPropagation()}>
              <div className="url-row">
                <Link2 size={14} className="muted-icon" />
                <input
                  className="input"
                  placeholder="YouTube / TikTok / Instagram URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy}
                />
                {busy ? (
                  <button className="btn small danger-btn" onClick={cancelIngest}>
                    <X size={14} /> Cancel
                  </button>
                ) : (
                  <button
                    className="btn small"
                    onClick={ingestUrl}
                    disabled={!url.trim()}
                  >
                    Fetch
                  </button>
                )}
              </div>
              <div className="or-row">
                <span>or</span>
                {busy ? (
                  <span className="muted">{progress || "Working…"}</span>
                ) : (
                  <button
                    className="btn ghost small"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={14} /> Upload / drop video
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void ingestUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {!busy && (
                <p className="muted clip-drop-hint">Drag a video file onto this card</p>
              )}
              {busy && (
                <p className="muted">
                  <Loader2 size={12} className="spin inline" /> {progress || "Processing…"} — you can
                  cancel
                </p>
              )}
              {clip.error && <p className="error-text">{clip.error}</p>}
            </div>
          )}
        </div>
      </div>

      <TrimModal
        open={trimOpen && !!pendingSrc}
        src={trimSrc}
        fileName={pendingMeta?.fileName || clip.fileName}
        initialSegments={trimSegments}
        initialCrop={trimCrop}
        initialBedMusic={trimBedMusic}
        initialHook={trimHook}
        initialMuteLookMusic={clip.muteLookMusic === true}
        initialSpeed={getClipSpeed(clip)}
        duration={trimDuration}
        onClose={() => {
          setTrimOpen(false);
          setPendingSrc(null);
          setPendingMeta(null);
        }}
        onConfirm={confirmTrim}
      />
    </>
  );
}
