"use client";

import { Square, Plus, X } from "lucide-react";
import { MAX_CLIP_GAP } from "@/lib/types";
import { clampClipGap } from "@/lib/defaults";

/** Compact black-hold row between clips / after a hook. */
export function GapChip({
  label,
  seconds,
  onChange,
  onClear,
}: {
  label: string;
  seconds: number;
  onChange: (seconds: number) => void;
  onClear: () => void;
}) {
  const value = clampClipGap(seconds);
  return (
    <div className="gap-chip" title="Black screen — overlays stay on">
      <Square size={11} className="muted-icon" aria-hidden />
      <span className="gap-chip-label">{label}</span>
      <input
        type="range"
        min={0.25}
        max={MAX_CLIP_GAP}
        step={0.25}
        value={Math.max(0.25, value)}
        aria-label={label}
        onChange={(e) => onChange(clampClipGap(parseFloat(e.target.value) || 0))}
      />
      <span className="gap-chip-time">{value.toFixed(1)}s</span>
      <button
        type="button"
        className="gap-chip-x"
        aria-label={`Remove ${label}`}
        onClick={onClear}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Tiny “+ black” insert when no gap is set. */
export function GapInsertButton({
  label,
  onInsert,
}: {
  label: string;
  onInsert: () => void;
}) {
  return (
    <button
      type="button"
      className="gap-insert"
      title={label}
      aria-label={label}
      onClick={onInsert}
    >
      <Plus size={11} />
      black
    </button>
  );
}
