"use client";

import { useState } from "react";
import { Type, Shapes, Trash2, Plus, Route, Crosshair } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  clipTimelineOffsets,
  createDefaultMotionPath,
  formatTime,
  normalizeMotionPath,
  resolveOverlayStartAt,
  sampleOverlayTransform,
  upsertMotionKeypoint,
} from "@/lib/defaults";
import type { OverlayMotionKeypoint, OverlayPlacement } from "@/lib/types";

export function OverlayPanel() {
  const {
    project,
    selectedOverlayId,
    setSelectedOverlayId,
    updateOverlayPlacement,
    removeOverlayPlacement,
    previewAbsTime,
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
        Right-click the middle preview to add Snapchat-style text or upload your
        own objects (PNG / GIF / WebM). Objects can follow a motion path with
        start, end, and mid points.
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
              previewAbsTime={previewAbsTime}
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
  previewAbsTime,
  onSelect,
  onChange,
  onRemove,
}: {
  placement: OverlayPlacement;
  start: number;
  selected: boolean;
  previewAbsTime: number;
  onSelect: () => void;
  onChange: (patch: Partial<OverlayPlacement>) => void;
  onRemove: () => void;
}) {
  const path = normalizeMotionPath(placement.motionPath);
  const hasMotion = placement.kind === "media" && path.length >= 2;
  const localT = Math.max(0, previewAbsTime - start);
  const live = sampleOverlayTransform(placement, localT);

  return (
    <li className={`overlay-row ${selected ? "selected" : ""}`}>
      <button type="button" className="overlay-row-main" onClick={onSelect}>
        {placement.kind === "text" ? <Type size={14} /> : <Shapes size={14} />}
        <span className="truncate">
          {placement.kind === "text"
            ? placement.text || "(empty)"
            : placement.fileName || "object"}
          {hasMotion ? " · path" : ""}
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

          {!hasMotion ? (
            <>
              <label className="field">
                <span>Position Y ({placement.y.toFixed(0)}%)</span>
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={1}
                  value={placement.y}
                  onChange={(e) =>
                    onChange({
                      y: Math.max(0, Math.min(100, parseFloat(e.target.value) || 50)),
                    })
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
            </>
          ) : (
            <p className="muted edge-crop-hint">
              Live at playhead: {live.x.toFixed(0)}%, {live.y.toFixed(0)}% — edit
              points below or drag the object on the preview.
            </p>
          )}

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

          {placement.kind === "media" ? (
            <MotionPathEditor
              placement={placement}
              overlayStart={start}
              previewAbsTime={previewAbsTime}
              onChange={onChange}
            />
          ) : null}

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

function MotionPathEditor({
  placement,
  overlayStart,
  previewAbsTime,
  onChange,
}: {
  placement: OverlayPlacement;
  overlayStart: number;
  previewAbsTime: number;
  onChange: (patch: Partial<OverlayPlacement>) => void;
}) {
  const path = normalizeMotionPath(placement.motionPath);
  const enabled = path.length >= 2;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const duration = Math.max(0.3, placement.duration || 3);

  function enablePath() {
    const next = createDefaultMotionPath(placement.x, placement.y, placement.scale);
    // Sensible default: start left-ish, end right-ish so motion is obvious
    next[0] = { ...next[0], x: Math.max(8, placement.x - 25), y: placement.y };
    next[1] = { ...next[1], x: Math.min(92, placement.x + 25), y: placement.y };
    onChange({ motionPath: next, x: next[0].x, y: next[0].y });
    setSelectedId(next[0].id);
  }

  function clearPath() {
    const live = sampleOverlayTransform(
      placement,
      Math.max(0, previewAbsTime - overlayStart)
    );
    onChange({ motionPath: [], x: live.x, y: live.y });
    setSelectedId(null);
  }

  function patchPoint(id: string, partial: Partial<OverlayMotionKeypoint>) {
    const cur = path.find((p) => p.id === id);
    if (!cur) return;
    onChange({
      motionPath: upsertMotionKeypoint(path, { ...cur, ...partial, id }),
    });
  }

  function removePoint(id: string) {
    if (path.length <= 2) return;
    onChange({ motionPath: path.filter((p) => p.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function addPointAtPlayhead() {
    const local = Math.max(0, Math.min(duration, previewAbsTime - overlayStart));
    const t = local / duration;
    const sample = sampleOverlayTransform(placement, local);
    // Default new point slightly offset so it's editable
    const kp = upsertMotionKeypoint(path.length ? path : createDefaultMotionPath(sample.x, sample.y), {
      t,
      x: sample.x,
      y: sample.y,
      scale: placement.scale,
    });
    onChange({ motionPath: kp });
    const added = kp.find((p) => Math.abs(p.t - t) < 0.002 && Math.abs(p.x - sample.x) < 0.5);
    if (added) setSelectedId(added.id);
  }

  function addMidPoint() {
    if (path.length < 2) {
      enablePath();
      return;
    }
    // Largest gap between consecutive points
    let bestI = 0;
    let bestSpan = -1;
    for (let i = 0; i < path.length - 1; i++) {
      const span = path[i + 1].t - path[i].t;
      if (span > bestSpan) {
        bestSpan = span;
        bestI = i;
      }
    }
    const a = path[bestI];
    const b = path[bestI + 1];
    const t = (a.t + b.t) / 2;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const next = upsertMotionKeypoint(path, { t, x, y });
    onChange({ motionPath: next });
    const hit = next.find(
      (p) => Math.abs(p.t - t) < 0.002 && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5
    );
    if (hit) setSelectedId(hit.id);
  }

  if (!enabled) {
    return (
      <div className="motion-path-block">
        <div className="motion-path-head">
          <Route size={14} />
          <span>Motion path</span>
        </div>
        <p className="muted edge-crop-hint">
          Track a person across the frame — set a start point, end point, and as
          many mid points as you need.
        </p>
        <button type="button" className="btn ghost small" onClick={enablePath}>
          <Route size={14} /> Enable motion path
        </button>
      </div>
    );
  }

  return (
    <div className="motion-path-block">
      <div className="motion-path-head">
        <Route size={14} />
        <span>Motion path ({path.length} points)</span>
        <button type="button" className="btn ghost small" onClick={clearPath}>
          Clear
        </button>
      </div>
      <p className="muted edge-crop-hint">
        Scrub the preview, then Add at playhead — or drag the object on the phone
        preview to move the selected point.
      </p>
      <div className="motion-path-actions">
        <button type="button" className="btn ghost small" onClick={addPointAtPlayhead}>
          <Crosshair size={14} /> Add at playhead
        </button>
        <button type="button" className="btn ghost small" onClick={addMidPoint}>
          <Plus size={14} /> Add mid point
        </button>
      </div>
      <ul className="motion-keypoint-list">
        {path.map((kp, i) => {
          const label =
            i === 0 ? "Start" : i === path.length - 1 ? "End" : `Point ${i + 1}`;
          const sec = kp.t * duration;
          const active = kp.id === selectedId;
          return (
            <li
              key={kp.id}
              className={`motion-keypoint ${active ? "selected" : ""}`}
            >
              <button
                type="button"
                className="motion-keypoint-main"
                onClick={() => setSelectedId(kp.id)}
              >
                <strong>{label}</strong>
                <span className="muted">
                  {sec.toFixed(2)}s · {kp.x.toFixed(0)}%, {kp.y.toFixed(0)}%
                </span>
              </button>
              {active ? (
                <div className="motion-keypoint-edit">
                  <label className="field">
                    <span>Time ({sec.toFixed(2)}s)</span>
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.05}
                      value={sec}
                      onChange={(e) =>
                        patchPoint(kp.id, {
                          t: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / duration)),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>X ({kp.x.toFixed(0)}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={kp.x}
                      onChange={(e) =>
                        patchPoint(kp.id, {
                          x: Math.max(0, Math.min(100, parseFloat(e.target.value) || 50)),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Y ({kp.y.toFixed(0)}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={kp.y}
                      onChange={(e) =>
                        patchPoint(kp.id, {
                          y: Math.max(0, Math.min(100, parseFloat(e.target.value) || 50)),
                        })
                      }
                    />
                  </label>
                  {path.length > 2 && i !== 0 && i !== path.length - 1 ? (
                    <button
                      type="button"
                      className="btn ghost small danger-btn"
                      onClick={() => removePoint(kp.id)}
                    >
                      <Trash2 size={14} /> Remove point
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
