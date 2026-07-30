/**
 * Pure helpers for trim preview playback — keeps seek-guards from getting stuck
 * after the user moves in/out points.
 */

export type TrimSeg = { start: number; end: number };

export function shouldIgnoreTimeUpdate(opts: {
  seeking: boolean;
  playing: boolean;
  currentTime: number;
  seg: TrimSeg | undefined;
}): boolean {
  if (opts.seeking) return true;
  if (!opts.playing) return true;
  if (!opts.seg) return true;
  return false;
}

export function nextPlaybackAction(opts: {
  currentTime: number;
  seg: TrimSeg;
  previewAll: boolean;
  segIndex: number;
  segCount: number;
}): "continue" | "advance" | "stop" {
  const { currentTime, seg, previewAll, segIndex, segCount } = opts;
  // Not yet inside the active range (mid-seek) — wait
  if (currentTime < seg.start - 0.02) return "continue";
  if (currentTime < seg.end - 0.04) return "continue";
  if (previewAll && segIndex < segCount - 1) return "advance";
  return "stop";
}

export function playheadAfterStartChange(opts: {
  newStart: number;
  currentTime: number;
  wasPlaying: boolean;
}): { seekTo: number; keepPlaying: boolean } {
  return {
    seekTo: opts.newStart,
    keepPlaying: opts.wasPlaying,
  };
}
