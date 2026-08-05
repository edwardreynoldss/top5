"use client";

import { useCallback, useRef } from "react";

export type RangeMarker = { start: number; end: number; id?: string };

type DragMode = "start" | "end" | "window";

/**
 * CapCut-style dual-handle time range control.
 * Drag either edge or the selected band; click the track to nudge the nearer handle.
 */
export function RangeRail({
  min = 0,
  max,
  start,
  end,
  onChange,
  playhead,
  markers,
  minSpan = 0.05,
  ariaLabel = "Trim range",
  formatValue,
}: {
  min?: number;
  max: number;
  start: number;
  end: number;
  onChange: (next: { start: number; end: number }) => void;
  playhead?: number;
  markers?: RangeMarker[];
  minSpan?: number;
  ariaLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    originX: number;
    originStart: number;
    originEnd: number;
  } | null>(null);

  const span = Math.max(minSpan, max - min);

  const clampPair = useCallback(
    (s: number, e: number) => {
      let nextStart = Math.max(min, Math.min(s, max - minSpan));
      let nextEnd = Math.max(nextStart + minSpan, Math.min(e, max));
      if (nextEnd - nextStart < minSpan) {
        nextEnd = Math.min(max, nextStart + minSpan);
        nextStart = Math.max(min, nextEnd - minSpan);
      }
      return { start: nextStart, end: nextEnd };
    },
    [min, max, minSpan]
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return min;
      const rect = el.getBoundingClientRect();
      const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      return min + Math.max(0, Math.min(1, t)) * span;
    },
    [min, span]
  );

  const beginDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      originX: e.clientX,
      originStart: start,
      originEnd: end,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const v = valueFromClientX(e.clientX);
    if (drag.mode === "start") {
      onChange(clampPair(v, end));
      return;
    }
    if (drag.mode === "end") {
      onChange(clampPair(start, v));
      return;
    }
    const el = trackRef.current;
    if (!el) return;
    const dx = e.clientX - drag.originX;
    const delta = (dx / el.getBoundingClientRect().width) * span;
    const width = drag.originEnd - drag.originStart;
    let nextStart = drag.originStart + delta;
    let nextEnd = nextStart + width;
    if (nextStart < min) {
      nextStart = min;
      nextEnd = min + width;
    }
    if (nextEnd > max) {
      nextEnd = max;
      nextStart = max - width;
    }
    onChange(clampPair(nextStart, nextEnd));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.("[data-rail-hit]")) return;
    const v = valueFromClientX(e.clientX);
    const mid = (start + end) / 2;
    if (v < mid) onChange(clampPair(v, end));
    else onChange(clampPair(start, v));
  };

  const label = formatValue || ((v: number) => v.toFixed(2));
  const leftPct = ((Math.max(min, Math.min(max, start)) - min) / span) * 100;
  const widthPct = ((Math.max(start, end) - start) / span) * 100;
  const playPct =
    playhead != null && Number.isFinite(playhead)
      ? ((Math.max(min, Math.min(max, playhead)) - min) / span) * 100
      : null;

  return (
    <div className="range-rail">
      <div className="range-rail-meta">
        <span>{label(start)}</span>
        <span className="muted">{label(Math.max(0, end - start))} selected</span>
        <span>{label(end)}</span>
      </div>
      <div
        ref={trackRef}
        className="range-rail-track"
        role="group"
        aria-label={ariaLabel}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {(markers || []).map((m, i) => {
          const left = ((m.start - min) / span) * 100;
          const width = ((Math.max(m.start, m.end) - m.start) / span) * 100;
          return (
            <div
              key={m.id || `mk-${i}`}
              className="range-rail-marker"
              style={{ left: `${left}%`, width: `${Math.max(0, width)}%` }}
            />
          );
        })}
        <div
          className="range-rail-window"
          data-rail-hit="window"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, widthPct)}%` }}
          onPointerDown={(e) => beginDrag("window", e)}
        />
        <button
          type="button"
          className="range-rail-handle start"
          data-rail-hit="start"
          aria-label="Range start"
          style={{ left: `${leftPct}%` }}
          onPointerDown={(e) => beginDrag("start", e)}
        />
        <button
          type="button"
          className="range-rail-handle end"
          data-rail-hit="end"
          aria-label="Range end"
          style={{ left: `${leftPct + widthPct}%` }}
          onPointerDown={(e) => beginDrag("end", e)}
        />
        {playPct != null ? (
          <div className="range-rail-playhead" style={{ left: `${playPct}%` }} />
        ) : null}
      </div>
    </div>
  );
}
