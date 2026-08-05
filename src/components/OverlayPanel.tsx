"use client";

import { Type, Shapes, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  clipTimelineOffsets,
  formatTime,
  resolveOverlayStartAt,
} from "@/lib/defaults";
import type { OverlayPlacement } from "@/lib/types";

export function OverlayPanel() {
  const {
    project,
    selectedOverlayId,
    setSelectedOverlayId,
    updateOverlayPlacement,
    removeOverlayPlacement,
  } = useEditor();

  const offsets = clipTimelineOffsets(project.clips, project.settings.playOrder);
  const totalDur = Math.max(
    0.1,
    offsets.reduce((s, o) => s + o.duration + (o.gapAfter || 0), 0)
  );
  const placements = project.overlayPlacements || [];

  return (
    <div className="panel-block overlay-panel">
      <div className="music-head">
        <Type size={16} />
        <span>Text & objects</span>
      </div>
      <p className="muted">
        Right-click the middle preview to add Snapchat-style text or objects
        (arrows, circles, GIFs from <code>overlays/</code>). Marks show on the
        scrubber like SFX.
      </p>

      <div className="sfx-timeline-track" aria-hidden>
        {placements.map((p) => {
          const start = resolveOverlayStartAt(p, offsets);
          const left = Math.min(100, Math.max(0, (start / totalDur) * 100));
          const selected = p.id === selectedOverlayId;
          return (
            <button
              key={p.id}
              type="button"
              className={`sfx-timeline-mark overlay-timeline-mark ${
                selected ? "selected" : ""
              }`}
              style={{ left: `${left}%` }}
              title={`${p.kind === "text" ? p.text : p.fileName} @ ${formatTime(start)}`}
              onClick={() => setSelectedOverlayId(p.id)}
            />
          );
        })}
      </div>

      <ul className="overlay-list">
        {placements.length === 0 ? (
          <li className="muted">No overlays yet — right-click the preview.</li>
        ) : (
          placements.map((p) => (
            <OverlayRow
              key={p.id}
              placement={p}
              start={resolveOverlayStartAt(p, offsets)}
              selected={p.id === selectedOverlayId}
              onSelect={() => setSelectedOverlayId(p.id)}
              onChange={(patch) => updateOverlayPlacement(p.id, patch)}
              onRemove={() => removeOverlayPlacement(p.id)}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function OverlayRow({
  placement,
  start,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  placement: OverlayPlacement;
  start: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<OverlayPlacement>) => void;
  onRemove: () => void;
}) {
  return (
    <li className={`overlay-row ${selected ? "selected" : ""}`}>
      <button type="button" className="overlay-row-main" onClick={onSelect}>
        {placement.kind === "text" ? <Type size={14} /> : <Shapes size={14} />}
        <span className="truncate">
          {placement.kind === "text"
            ? placement.text || "(empty)"
            : placement.fileName || "object"}
        </span>
        <span className="muted">{formatTime(start)}</span>
      </button>
      {selected ? (
        <div className="overlay-row-edit">
          <label className="field">
            <span>Start ({formatTime(placement.startAt)})</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={placement.startAt}
              onChange={(e) =>
                onChange({ startAt: Math.max(0, parseFloat(e.target.value) || 0) })
              }
            />
          </label>
          <label className="field">
            <span>Duration ({placement.duration.toFixed(1)}s)</span>
            <input
              type="range"
              min={0.5}
              max={12}
              step={0.1}
              value={placement.duration}
              onChange={(e) =>
                onChange({ duration: Math.max(0.3, parseFloat(e.target.value) || 3) })
              }
            />
          </label>
          <label className="field">
            <span>Position Y ({placement.y.toFixed(0)}%)</span>
            <input
              type="range"
              min={5}
              max={95}
              step={1}
              value={placement.y}
              onChange={(e) =>
                onChange({ y: Math.max(0, Math.min(100, parseFloat(e.target.value) || 50)) })
              }
            />
          </label>
          {placement.kind === "media" ? (
            <label className="field">
              <span>Position X ({placement.x.toFixed(0)}%)</span>
              <input
                type="range"
                min={5}
                max={95}
                step={1}
                value={placement.x}
                onChange={(e) =>
                  onChange({
                    x: Math.max(0, Math.min(100, parseFloat(e.target.value) || 50)),
                  })
                }
              />
            </label>
          ) : null}
          <label className="field">
            <span>Scale ({placement.scale.toFixed(2)}×)</span>
            <input
              type="range"
              min={0.35}
              max={2.5}
              step={0.05}
              value={placement.scale}
              onChange={(e) =>
                onChange({
                  scale: Math.max(0.35, Math.min(3, parseFloat(e.target.value) || 1)),
                })
              }
            />
          </label>
          {placement.kind === "text" ? (
            <label className="field">
              <span>Text</span>
              <textarea
                rows={2}
                value={placement.text}
                onChange={(e) => onChange({ text: e.target.value })}
              />
            </label>
          ) : null}
          <button type="button" className="btn ghost small danger-btn" onClick={onRemove}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}
