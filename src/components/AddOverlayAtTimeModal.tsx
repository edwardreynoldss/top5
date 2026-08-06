"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Type, Shapes, X, Check, Upload } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatTime, nextSnapTextStyle } from "@/lib/defaults";
import { overlayMediaUrl } from "@/lib/overlayMedia";
import type { OverlayPlacement, SnapTextStyle } from "@/lib/types";

const EMOJI_QUICK = [
  "😂",
  "😭",
  "🔥",
  "💀",
  "👀",
  "✨",
  "❤️",
  "💯",
  "😮",
  "🤣",
  "😍",
  "👏",
  "🙌",
  "😎",
  "🤯",
  "😤",
];

type FolderItem = {
  id: string;
  fileName: string;
  mediaId: string;
  mediaUrl: string;
  bundled?: boolean;
};

const STYLE_LABEL: Record<SnapTextStyle, string> = {
  classic: "Classic bar",
  box: "Rounded box",
  plain: "No background",
};

export function AddOverlayAtTimeModal({
  open,
  atTime,
  initialKind = "text",
  onClose,
}: {
  open: boolean;
  atTime: number;
  initialKind?: "text" | "media";
  onClose: () => void;
}) {
  const { placeOverlay, setSelectedOverlayId, requestOverlaysTab } = useEditor();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"text" | "media">(initialKind);
  const [text, setText] = useState("Type here 😂");
  const [textStyle, setTextStyle] = useState<SnapTextStyle>("classic");
  const [showBackground, setShowBackground] = useState(true);
  const [color, setColor] = useState("#FFFFFF");
  const [scale, setScale] = useState(1);
  const [duration, setDuration] = useState(3);
  const [y, setY] = useState(50);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedMediaIdRef = useRef(selectedMediaId);
  selectedMediaIdRef.current = selectedMediaId;

  useEffect(() => {
    setMounted(true);
  }, []);

  const uploadedItems = useMemo(
    () => folderItems.filter((i) => !i.bundled),
    [folderItems]
  );
  const sampleItems = useMemo(
    () => folderItems.filter((i) => i.bundled),
    [folderItems]
  );
  const visibleItems = useMemo(
    () => (showSamples ? [...uploadedItems, ...sampleItems] : uploadedItems),
    [showSamples, uploadedItems, sampleItems]
  );

  const selectedMedia = useMemo(
    () => folderItems.find((i) => i.mediaId === selectedMediaId) || null,
    [folderItems, selectedMediaId]
  );

  const refreshFolder = useCallback(async (preferMediaId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/overlays/library", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read overlays folder");
      const items: FolderItem[] = data.items || [];
      setFolderItems(items);
      const prefer = preferMediaId || selectedMediaIdRef.current;
      const uploads = items.filter((i) => !i.bundled);
      const pick =
        (prefer && items.find((i) => i.mediaId === prefer)?.mediaId) ||
        uploads[0]?.mediaId ||
        "";
      setSelectedMediaId(pick);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load objects");
    } finally {
      setLoading(false);
    }
  }, []);

  async function uploadOverlayFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(Boolean);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    let lastId = "";
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/overlays/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Upload failed: ${file.name}`);
        lastId = data.mediaId || lastId;
      }
      setShowSamples(false);
      await refreshFolder(lastId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!open) return;
    setTab(initialKind);
    setText("Type here 😂");
    setTextStyle("classic");
    setShowBackground(true);
    setColor("#FFFFFF");
    setScale(1);
    setDuration(3);
    setY(50);
    setError(null);
    setPlacing(false);
    setShowSamples(false);
    setDragOver(false);
    void refreshFolder();
  }, [open, atTime, initialKind, refreshFolder]);

  if (!mounted || !open) return null;

  async function confirm() {
    setPlacing(true);
    setError(null);
    try {
      let id: string;
      if (tab === "text") {
        const t = text.trim();
        if (!t) throw new Error("Enter some text (emoji OK)");
        id = placeOverlay({
          kind: "text",
          startAt: Number(atTime.toFixed(2)),
          duration,
          y,
          scale,
          text: t,
          textStyle,
          color,
          showBackground: textStyle === "plain" ? false : showBackground,
          x: 50,
        });
      } else {
        if (!selectedMedia) throw new Error("Upload or pick an object first");
        id = placeOverlay({
          kind: "media",
          startAt: Number(atTime.toFixed(2)),
          duration,
          y,
          x: 50,
          scale,
          text: "",
          mediaId: selectedMedia.mediaId,
          mediaUrl: overlayMediaUrl(selectedMedia.mediaId, selectedMedia.mediaUrl),
          fileName: selectedMedia.fileName,
        });
      }
      setSelectedOverlayId(id);
      requestOverlaysTab();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place overlay");
    } finally {
      setPlacing(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card add-sfx-modal add-overlay-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Add overlay at time"
      >
        <div className="modal-head">
          <div>
            <h3>Add at {formatTime(atTime)}</h3>
            <p className="muted">
              Snapchat-style text, or upload your own arrows / GIFs / stickers
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="add-overlay-tabs">
          <button
            type="button"
            className={`add-overlay-tab ${tab === "text" ? "active" : ""}`}
            onClick={() => setTab("text")}
          >
            <Type size={14} /> Text
          </button>
          <button
            type="button"
            className={`add-overlay-tab ${tab === "media" ? "active" : ""}`}
            onClick={() => setTab("media")}
          >
            <Shapes size={14} /> Object
          </button>
        </div>

        {tab === "text" ? (
          <div className="add-overlay-body">
            <label className="field">
              <span>Caption</span>
              <textarea
                className="add-overlay-textarea"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a caption… emoji welcome"
                autoFocus
              />
            </label>
            <div className="add-overlay-emoji-row" aria-label="Quick emoji">
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="add-overlay-emoji"
                  onClick={() => setText((t) => `${t}${e}`)}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="snap-preview-stage" aria-hidden>
              <div
                className={`snap-caption snap-caption-${textStyle} ${
                  showBackground && textStyle !== "plain" ? "has-bg" : ""
                }`}
                style={{
                  top: `${y}%`,
                  color,
                  ["--snap-scale" as string]: String(scale),
                }}
              >
                <span className="snap-caption-text">{text || " "}</span>
              </div>
            </div>

            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  const next = nextSnapTextStyle(textStyle);
                  setTextStyle(next);
                  if (next === "plain") setShowBackground(false);
                  else setShowBackground(true);
                }}
              >
                Style: {STYLE_LABEL[textStyle]}
              </button>
              <label className="field inline-field" title="Text color">
                <span>Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>Size ({scale.toFixed(2)}×)</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
              />
            </label>
            <label className="field">
              <span>Vertical position ({y.toFixed(0)}%)</span>
              <input
                type="range"
                min={8}
                max={92}
                step={1}
                value={y}
                onChange={(e) => setY(parseFloat(e.target.value) || 50)}
              />
            </label>
            <label className="field">
              <span>On screen ({duration.toFixed(1)}s)</span>
              <input
                type="range"
                min={0.5}
                max={12}
                step={0.1}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 3)}
              />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: "0.75rem" }}>
              Font is Public Sans (OFL) — the standard free match for Snapchat Sans
              (Snapchat Sans itself is proprietary and not redistributable).
            </p>
          </div>
        ) : (
          <div className="add-overlay-body">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.webm,.mp4,.mov"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void uploadOverlayFiles(e.target.files);
              }}
            />
            <button
              type="button"
              className={`add-overlay-dropzone ${dragOver ? "drag-over" : ""}`}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  void uploadOverlayFiles(e.dataTransfer.files);
                }
              }}
            >
              {uploading ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Upload size={18} />
              )}
              <span>
                {uploading
                  ? "Uploading…"
                  : "Upload your own arrows, circles, GIFs…"}
              </span>
              <span className="muted">PNG · GIF · WebP · JPG · WebM · MP4</span>
            </button>

            <div className="add-sfx-toolbar">
              <strong>Your objects</strong>
              <div className="row" style={{ gap: "0.35rem" }}>
                {sampleItems.length > 0 ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setShowSamples((v) => !v)}
                  >
                    {showSamples ? "Hide samples" : "Show samples"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void refreshFolder()}
                  disabled={loading || uploading}
                >
                  {loading ? <Loader2 size={14} className="spin" /> : null}
                  Refresh
                </button>
              </div>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            <div className="add-overlay-grid">
              {visibleItems.map((it) => (
                <button
                  key={it.mediaId}
                  type="button"
                  className={`add-overlay-tile ${
                    selectedMediaId === it.mediaId ? "active" : ""
                  }`}
                  onClick={() => setSelectedMediaId(it.mediaId)}
                  title={it.fileName}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.mediaUrl} alt={it.fileName} />
                  <span>
                    {it.bundled ? "sample · " : ""}
                    {it.fileName.replace(/\.[^.]+$/, "")}
                  </span>
                </button>
              ))}
              {!loading && uploadedItems.length === 0 && !showSamples ? (
                <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                  No uploads yet — use the button above, or drop files into{" "}
                  <code>overlays/</code>.
                </p>
              ) : null}
            </div>
            <label className="field">
              <span>Size ({scale.toFixed(2)}×)</span>
              <input
                type="range"
                min={0.35}
                max={2.5}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
              />
            </label>
            <label className="field">
              <span>Vertical position ({y.toFixed(0)}%)</span>
              <input
                type="range"
                min={8}
                max={92}
                step={1}
                value={y}
                onChange={(e) => setY(parseFloat(e.target.value) || 50)}
              />
            </label>
            <label className="field">
              <span>On screen ({duration.toFixed(1)}s)</span>
              <input
                type="range"
                min={0.5}
                max={12}
                step={0.1}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 3)}
              />
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={placing || (tab === "media" && !selectedMedia)}
            onClick={() => void confirm()}
          >
            {placing ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            Place at {formatTime(atTime)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Live preview chrome for a placed Snapchat caption (DOM, not canvas). */
export function SnapCaptionView({
  overlay,
  selected,
  onPointerDown,
}: {
  overlay: OverlayPlacement;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const style = overlay.textStyle || "classic";
  const showBg = overlay.showBackground !== false && style !== "plain";
  return (
    <div
      className={`snap-caption snap-caption-${style} ${showBg ? "has-bg" : ""} ${
        selected ? "selected" : ""
      }`}
      style={{
        top: `${overlay.y}%`,
        left: style === "classic" ? 0 : `${overlay.x}%`,
        color: overlay.color || "#FFFFFF",
        ["--snap-scale" as string]: String(overlay.scale || 1),
        transform:
          style === "classic"
            ? "translateY(-50%)"
            : `translate(-50%, -50%)`,
      }}
      onPointerDown={onPointerDown}
    >
      <span className="snap-caption-text">{overlay.text || " "}</span>
    </div>
  );
}
