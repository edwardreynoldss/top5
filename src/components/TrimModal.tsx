"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/defaults";
import { X, Play, Pause, Check } from "lucide-react";

interface TrimModalProps {
  open: boolean;
  src: string;
  fileName?: string | null;
  initialStart: number;
  initialEnd: number;
  duration: number;
  onClose: () => void;
  onConfirm: (start: number, end: number) => void;
}

export function TrimModal({
  open,
  src,
  fileName,
  initialStart,
  initialEnd,
  duration,
  onClose,
  onConfirm,
}: TrimModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(initialStart);
  const [dur, setDur] = useState(duration);

  useEffect(() => {
    if (!open) return;
    setStart(initialStart);
    setEnd(Math.min(initialEnd, duration || initialEnd));
    setDur(duration);
    setPlaying(false);
  }, [open, initialStart, initialEnd, duration, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;
    const onMeta = () => {
      const d = v.duration || duration;
      setDur(d);
      setEnd((e) => Math.min(e || Math.min(4, d), d));
    };
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.currentTime >= end - 0.04) {
        v.pause();
        setPlaying(false);
        v.currentTime = start;
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [open, start, end, duration]);

  if (!open) return null;

  const playPreview = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    v.currentTime = start;
    await v.play();
    setPlaying(true);
  };

  const clampStart = (v: number) => {
    const next = Math.max(0, Math.min(v, end - 0.2));
    setStart(next);
    if (videoRef.current) videoRef.current.currentTime = next;
  };

  const clampEnd = (v: number) => {
    const next = Math.max(start + 0.2, Math.min(v, dur || v));
    setEnd(next);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3>Trim clip</h3>
            <p className="muted">{fileName || "Preview the exact moment before inserting"}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="trim-video-wrap">
          <video ref={videoRef} src={src} playsInline className="trim-video" />
        </div>

        <div className="trim-controls">
          <div className="trim-row">
            <label>Start {formatTime(start)}</label>
            <input
              type="range"
              min={0}
              max={dur || 1}
              step={0.05}
              value={start}
              onChange={(e) => clampStart(parseFloat(e.target.value))}
            />
          </div>
          <div className="trim-row">
            <label>End {formatTime(end)}</label>
            <input
              type="range"
              min={0}
              max={dur || 1}
              step={0.05}
              value={end}
              onChange={(e) => clampEnd(parseFloat(e.target.value))}
            />
          </div>
          <div className="trim-range-visual">
            <div
              className="trim-selected"
              style={{
                left: `${dur ? (start / dur) * 100 : 0}%`,
                width: `${dur ? ((end - start) / dur) * 100 : 0}%`,
              }}
            />
            <div
              className="trim-playhead"
              style={{ left: `${dur ? (current / dur) * 100 : 0}%` }}
            />
          </div>
          <p className="muted center">
            Selected length: <strong>{(end - start).toFixed(2)}s</strong> · Source{" "}
            {formatTime(dur)}
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={playPreview}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            Preview trim
          </button>
          <button
            className="btn primary"
            onClick={() => onConfirm(start, end)}
          >
            <Check size={16} />
            Use this clip
          </button>
        </div>
      </div>
    </div>
  );
}
