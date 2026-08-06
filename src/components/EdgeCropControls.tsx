"use client";

import {
  Minus,
  Plus,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair,
} from "lucide-react";
import {
  MAX_EDGE_CROP,
  clampCropEdge,
  clampCropPan,
  clampCropZoom,
  defaultCrop,
  normalizeCrop,
} from "@/lib/defaults";
import type { ClipCrop } from "@/lib/types";

const EDGE_STEP = 0.01;
const PAN_STEP = 5;

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
      <div className="crop-pan-axis-row">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move toward ${lowLabel}`}
          disabled={v <= 0}
          onClick={() => onChange(clampCropPan(v - PAN_STEP))}
        >
          {lowLabel === "Left" ? <ArrowLeft size={14} /> : <ArrowUp size={14} />}
        </button>
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
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move toward ${highLabel}`}
          disabled={v >= 100}
          onClick={() => onChange(clampCropPan(v + PAN_STEP))}
        >
          {highLabel === "Right" ? (
            <ArrowRight size={14} />
          ) : (
            <ArrowDown size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

/** Position (pan) + edge crop + zoom. Drag-on-preview still works alongside these. */
export function EdgeCropControls({
  crop,
  onChange,
}: {
  crop: ClipCrop;
  onChange: (next: ClipCrop) => void;
}) {
  const n = normalizeCrop(crop);
  const patch = (partial: Partial<ClipCrop>) =>
    onChange(normalizeCrop({ ...crop, ...partial }));

  return (
    <div className="edge-crop-controls">
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
          Move the clip up / down / left / right when the subject sits too high or low
        </p>
        <div className="crop-pan-pad" aria-label="Nudge position">
          <button
            type="button"
            className="icon-btn crop-pan-nudge"
            aria-label="Move up"
            disabled={n.panY <= 0}
            onClick={() => patch({ panY: clampCropPan(n.panY - PAN_STEP) })}
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            className="icon-btn crop-pan-nudge"
            aria-label="Move left"
            disabled={n.panX <= 0}
            onClick={() => patch({ panX: clampCropPan(n.panX - PAN_STEP) })}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-btn crop-pan-nudge crop-pan-nudge-center"
            aria-label="Center"
            onClick={() => patch({ panX: 50, panY: 50 })}
          >
            <Crosshair size={14} />
          </button>
          <button
            type="button"
            className="icon-btn crop-pan-nudge"
            aria-label="Move right"
            disabled={n.panX >= 100}
            onClick={() => patch({ panX: clampCropPan(n.panX + PAN_STEP) })}
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="icon-btn crop-pan-nudge"
            aria-label="Move down"
            disabled={n.panY >= 100}
            onClick={() => patch({ panY: clampCropPan(n.panY + PAN_STEP) })}
          >
            <ArrowDown size={16} />
          </button>
        </div>
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

      <div className="edge-crop-grid">
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
      <div className="edge-crop-zoom">
        <div className="edge-crop-zoom-meta">
          <span>Zoom</span>
          <strong>
            {n.zoom.toFixed(2)}×
            {n.zoom < 1 ? " out" : n.zoom > 1 ? " in" : ""}
          </strong>
        </div>
        <input
          type="range"
          className="slider-inline"
          min={0.25}
          max={3}
          step={0.05}
          value={clampCropZoom(n.zoom)}
          onChange={(e) =>
            patch({ zoom: clampCropZoom(parseFloat(e.target.value)) })
          }
          aria-label="Zoom"
        />
        <p className="muted edge-crop-hint">
          Drag the preview to pan · scroll to zoom · edge % covers with black
        </p>
      </div>
      <button type="button" className="btn ghost small" onClick={() => onChange(defaultCrop())}>
        <RotateCcw size={14} /> Reset framing
      </button>
    </div>
  );
}
