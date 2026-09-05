"use client";

import { Minus, Plus, RotateCcw, Crosshair } from "lucide-react";
import {
  MAX_EDGE_CROP,
  clampCropEdge,
  clampCropPan,
  clampCropZoom,
  coverContainFactor,
  defaultCrop,
  normalizeCrop,
} from "@/lib/defaults";
import type { ClipCrop } from "@/lib/types";

const EDGE_STEP = 0.01;

function EdgeStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(clampCropEdge(value) * 100);
  return (
    <div className="edge-stepper">
      <span className="edge-stepper-label">{label}</span>
      <div className="edge-stepper-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Decrease ${label}`}
          disabled={pct <= 0}
          onClick={() => onChange(clampCropEdge(value - EDGE_STEP))}
        >
          <Minus size={14} />
        </button>
        <input
          className="input edge-stepper-input"
          type="number"
          min={0}
          max={Math.round(MAX_EDGE_CROP * 100)}
          step={1}
          value={pct}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) return;
            onChange(clampCropEdge(n / 100));
          }}
        />
        <span className="edge-stepper-unit">%</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Increase ${label}`}
          disabled={pct >= Math.round(MAX_EDGE_CROP * 100)}
          onClick={() => onChange(clampCropEdge(value + EDGE_STEP))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function PanAxis({
  label,
  value,
  lowLabel,
  highLabel,
  onChange,
}: {
  label: string;
  value: number;
  lowLabel: string;
  highLabel: string;
  onChange: (v: number) => void;
}) {
  const v = clampCropPan(value);
  return (
    <div className="crop-pan-axis">
      <div className="crop-pan-axis-meta">
        <span>{label}</span>
        <strong>
          {lowLabel} {Math.round(v)} {highLabel}
        </strong>
      </div>
      <input
        type="range"
        className="slider-inline"
        min={0}
        max={100}
        step={1}
        value={v}
        onChange={(e) => onChange(clampCropPan(parseFloat(e.target.value)))}
        aria-label={label}
      />
    </div>
  );
}

/** Position (pan) + edge crop + zoom. Drag-on-preview still works alongside these. */
export function EdgeCropControls({
  crop,
  onChange,
  videoAspect,
  frameAspect = 9 / 16,
  showZoomPan = true,
}: {
  crop: ClipCrop;
  onChange: (next: ClipCrop) => void;
  /** Source pixel aspect — used for “Fill frame” zoom. */
  videoAspect?: number;
  frameAspect?: number;
  /**
   * Hide the static Position (pan) + Zoom blocks. Used when the clip is driven
   * by an animated zoom timeline instead, so those controls don't conflict.
   */
  showZoomPan?: boolean;
}) {
  const n = normalizeCrop(crop);
  const patch = (partial: Partial<ClipCrop>) =>
    onChange(normalizeCrop({ ...crop, ...partial }));
  const coverZoom =
    videoAspect && videoAspect > 0
      ? clampCropZoom(coverContainFactor(frameAspect, videoAspect))
      : null;

  return (
    <div className="edge-crop-controls">
      {!showZoomPan ? (
        <p className="muted edge-crop-hint" style={{ margin: 0 }}>
          Zoom &amp; pan are controlled by the zoom timeline under the preview.
          Edge crop below still applies.
        </p>
      ) : null}
      {showZoomPan ? (
      <div className="crop-pan-block">
        <div className="crop-pan-head">
          <span>Position</span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => patch({ panX: 50, panY: 50 })}
            title="Center the clip"
          >
            <Crosshair size={14} /> Center
          </button>
        </div>
        <p className="muted edge-crop-hint">
          Slide to move the clip when the subject sits too high, low, or off-center
        </p>
        <PanAxis
          label="Horizontal"
          value={n.panX}
          lowLabel="Left"
          highLabel="Right"
          onChange={(panX) => patch({ panX })}
        />
        <PanAxis
          label="Vertical"
          value={n.panY}
          lowLabel="Up"
          highLabel="Down"
          onChange={(panY) => patch({ panY })}
        />
      </div>
      ) : null}

      <div className="edge-crop-grid">
        <p className="muted edge-crop-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
          Cut edges of the clip (watermarks etc.) — drag the green handles on the
          preview, or use the steppers. Subscribe sticker stays on the frame.
          Position still moves the cropped clip.
        </p>
        <EdgeStepper
          label="Top"
          value={n.cropTop || 0}
          onChange={(cropTop) => patch({ cropTop })}
        />
        <EdgeStepper
          label="Bottom"
          value={n.cropBottom || 0}
          onChange={(cropBottom) => patch({ cropBottom })}
        />
        <EdgeStepper
          label="Left"
          value={n.cropLeft || 0}
          onChange={(cropLeft) => patch({ cropLeft })}
        />
        <EdgeStepper
          label="Right"
          value={n.cropRight || 0}
          onChange={(cropRight) => patch({ cropRight })}
        />
      </div>
      {showZoomPan ? (
      <div className="edge-crop-zoom">
        <div className="edge-crop-zoom-meta">
          <span>Zoom</span>
          <strong>
            {n.zoom.toFixed(2)}×
            {Math.abs(n.zoom - 1) < 0.02
              ? " · full frame"
              : n.zoom < 1
                ? " out"
                : " in"}
          </strong>
        </div>
        <input
          type="range"
          className="slider-inline"
          min={0.25}
          max={4}
          step={0.05}
          value={clampCropZoom(n.zoom)}
          onChange={(e) =>
            patch({ zoom: clampCropZoom(parseFloat(e.target.value)) })
          }
          aria-label="Zoom"
        />
        <div className="crop-zoom-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => patch({ zoom: 1 })}
          >
            Full frame
          </button>
          {coverZoom && coverZoom > 1.02 ? (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => patch({ zoom: coverZoom })}
              title="Fill the Shorts frame (may crop edges / baked bars)"
            >
              Fill screen
            </button>
          ) : null}
        </div>
        <p className="muted edge-crop-hint">
          1× shows the whole source (keeps baked black bars). Drag preview to pan ·
          scroll to zoom.
        </p>
      </div>
      ) : null}
      <button type="button" className="btn ghost small" onClick={() => onChange(defaultCrop())}>
        <RotateCcw size={14} /> Reset framing
      </button>
    </div>
  );
}
