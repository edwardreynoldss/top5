"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  MAX_EDGE_CROP,
  clampCropEdge,
  clampCropZoom,
  defaultCrop,
  normalizeCrop,
} from "@/lib/defaults";
import type { ClipCrop } from "@/lib/types";

const STEP = 0.01;

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
          onClick={() => onChange(clampCropEdge(value - STEP))}
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
          onClick={() => onChange(clampCropEdge(value + STEP))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** Compact edge crop + zoom — no stacked range bars, pan via drag on preview. */
export function EdgeCropControls({
  crop,
  onChange,
}: {
  crop: ClipCrop;
  onChange: (next: ClipCrop) => void;
}) {
  const n = normalizeCrop(crop);
  const patch = (partial: Partial<ClipCrop>) => onChange(normalizeCrop({ ...crop, ...partial }));

  return (
    <div className="edge-crop-controls">
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
          onChange={(e) => patch({ zoom: clampCropZoom(parseFloat(e.target.value)) })}
          aria-label="Zoom"
        />
        <p className="muted edge-crop-hint">
          Drag the preview to pan · scroll to zoom · edges cover with black
        </p>
      </div>
      <button type="button" className="btn ghost small" onClick={() => onChange(defaultCrop())}>
        <RotateCcw size={14} /> Reset framing
      </button>
    </div>
  );
}
