import { v4 as uuidv4 } from "uuid";
import type {
  ClipBedMusic,
  ClipCrop,
  ClipHook,
  EditorProject,
  OverlayMotionKeypoint,
  OverlayPlacement,
  ProjectSettings,
  RankClip,
  SnapTextStyle,
  StickerOverlay,
  TitleLine,
  TitleWord,
  TrimSegment,
} from "./types";
import {
  DEFAULT_CLIP_DURATION,
  MAX_CLIP_DURATION,
  MAX_CLIP_GAP,
  MAX_HOOK_DURATION,
  MIN_HOOK_DURATION,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
} from "./types";

export function defaultSticker(): StickerOverlay {
  return {
    enabled: false,
    mediaId: null,
    mediaUrl: null,
    fileName: null,
    scale: 0.55,
    speed: 1,
    startAt: 20,
    duration: 0,
    hasAlpha: false,
  };
}

/** Merge partial/legacy sticker with defaults and clamp fields. */
export function normalizeSticker(sticker?: Partial<StickerOverlay> | null): StickerOverlay {
  const d = defaultSticker();
  const scale =
    typeof sticker?.scale === "number" && Number.isFinite(sticker.scale) ? sticker.scale : d.scale;
  const speed =
    typeof sticker?.speed === "number" && Number.isFinite(sticker.speed) ? sticker.speed : d.speed;
  const startAt =
    typeof sticker?.startAt === "number" && Number.isFinite(sticker.startAt)
      ? sticker.startAt
      : d.startAt;
  const duration =
    typeof sticker?.duration === "number" && Number.isFinite(sticker.duration)
      ? sticker.duration
      : d.duration;
  const mediaId = sticker?.mediaId ?? d.mediaId;
  const wantsEnabled =
    typeof sticker?.enabled === "boolean" ? sticker.enabled : Boolean(mediaId);
  return {
    enabled: Boolean(wantsEnabled && mediaId),
    mediaId,
    mediaUrl:
      sticker?.mediaUrl ??
      (mediaId ? `/api/media/${mediaId}` : d.mediaUrl),
    fileName: sticker?.fileName ?? d.fileName,
    scale: Math.max(0.15, Math.min(1.5, scale)),
    speed: Math.max(0.25, Math.min(3, speed)),
    startAt: Math.max(0, startAt),
    duration: Math.max(0, duration),
    hasAlpha: Boolean(sticker?.hasAlpha),
  };
}

/** How long the sticker occupies on the timeline (source duration ÷ speed). */
export function stickerPlayDuration(sticker: Pick<StickerOverlay, "duration" | "speed">) {
  const speed = Math.max(0.25, Math.min(3, sticker.speed || 1));
  const dur = Number.isFinite(sticker.duration) && sticker.duration > 0 ? sticker.duration : 3;
  // WebM duration tags often end before the visual outro finishes — pad so we
  // don't hide/cut the transition-out early in preview or clip-overlap math.
  const padded = dur * 1.35 + 0.75;
  return Math.max(0.2, padded / speed);
}

/**
 * Where the sticker lands inside a clip on the absolute timeline.
 * Returns null when this clip does not overlap the sticker window.
 */
export function stickerPlacementInClip(
  sticker: Pick<StickerOverlay, "startAt" | "duration" | "speed" | "enabled">,
  clipStart: number,
  clipDuration: number
): { delay: number; end: number; sourceSeek: number } | null {
  if (!sticker.enabled) return null;
  const absStart = Math.max(0, Number.isFinite(sticker.startAt) ? sticker.startAt : 20);
  const playDur = stickerPlayDuration(sticker);
  const absEnd = absStart + playDur;
  const clipEnd = clipStart + clipDuration;
  if (absEnd <= clipStart + 0.01 || absStart >= clipEnd - 0.01) return null;

  const speed = Math.max(0.25, Math.min(3, sticker.speed || 1));
  const delay = Math.max(0, absStart - clipStart);
  const end = Math.min(clipDuration, absEnd - clipStart);
  const sourceSeek =
    clipStart > absStart ? Math.max(0, (clipStart - absStart) * speed) : 0;
  return { delay, end, sourceSeek };
}

export function createWord(text: string, color = "#FFFFFF"): TitleWord {
  return { id: uuidv4(), text, color };
}

export function createLine(words: Array<{ text: string; color?: string }>): TitleLine {
  return {
    id: uuidv4(),
    words: words.map((w) => createWord(w.text, w.color || "#FFFFFF")),
  };
}

export function createSegment(start: number, end: number, speed = 1): TrimSegment {
  return { id: uuidv4(), start, end, speed: clampClipSpeed(speed) };
}

/** Max fraction of height/width removable from one edge */
export const MAX_EDGE_CROP = 0.45;
/** Keep at least this much of the source height after top+bottom crop */
export const MIN_VISIBLE_HEIGHT = 0.2;
/** Keep at least this much of the source width after left+right crop */
export const MIN_VISIBLE_WIDTH = 0.2;

export function defaultCrop(): ClipCrop {
  return {
    zoom: 1,
    panX: 50,
    panY: 50,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
  };
}

export function clampCropEdge(value: number) {
  return Math.max(0, Math.min(MAX_EDGE_CROP, Number.isFinite(value) ? value : 0));
}

/** Clamp and rebalance top/bottom so enough of the frame remains. */
export function normalizeVerticalCrop(cropTop = 0, cropBottom = 0) {
  let top = clampCropEdge(cropTop);
  let bottom = clampCropEdge(cropBottom);
  const maxSum = 1 - MIN_VISIBLE_HEIGHT;
  if (top + bottom > maxSum) {
    const scale = maxSum / (top + bottom);
    top *= scale;
    bottom *= scale;
  }
  return { top, bottom, visibleH: Math.max(MIN_VISIBLE_HEIGHT, 1 - top - bottom) };
}

/** Clamp and rebalance left/right so enough of the frame remains. */
export function normalizeHorizontalCrop(cropLeft = 0, cropRight = 0) {
  let left = clampCropEdge(cropLeft);
  let right = clampCropEdge(cropRight);
  const maxSum = 1 - MIN_VISIBLE_WIDTH;
  if (left + right > maxSum) {
    const scale = maxSum / (left + right);
    left *= scale;
    right *= scale;
  }
  return { left, right, visibleW: Math.max(MIN_VISIBLE_WIDTH, 1 - left - right) };
}

/** Merge partial/legacy crop with defaults and clamp all fields. */
export function normalizeCrop(crop?: Partial<ClipCrop> | null): ClipCrop {
  const d = defaultCrop();
  const vEdges = normalizeVerticalCrop(crop?.cropTop ?? 0, crop?.cropBottom ?? 0);
  const hEdges = normalizeHorizontalCrop(crop?.cropLeft ?? 0, crop?.cropRight ?? 0);
  const panX = typeof crop?.panX === "number" && Number.isFinite(crop.panX) ? crop.panX : d.panX;
  const panY = typeof crop?.panY === "number" && Number.isFinite(crop.panY) ? crop.panY : d.panY;
  return {
    zoom: clampCropZoom(crop?.zoom ?? d.zoom),
    panX: Math.max(0, Math.min(100, panX)),
    panY: Math.max(0, Math.min(100, panY)),
    cropTop: vEdges.top,
    cropBottom: vEdges.bottom,
    cropLeft: hEdges.left,
    cropRight: hEdges.right,
  };
}

export type CropEdge = "left" | "right" | "top" | "bottom";

/**
 * Map a pointer position inside the crop WINDOW (0–1, full source aspect box)
 * to an updated edge-crop value. Pan/zoom only move that window on the stage —
 * measuring in window-local space keeps edge drag stable while placing the clip.
 */
export function cropEdgeFromWindowPoint(
  edge: CropEdge,
  nx: number,
  ny: number,
  current: Partial<ClipCrop> | null | undefined
): ClipCrop {
  const base = normalizeCrop(current);
  const x = Math.max(0, Math.min(1, Number.isFinite(nx) ? nx : 0));
  const y = Math.max(0, Math.min(1, Number.isFinite(ny) ? ny : 0));
  if (edge === "left") {
    const maxLeft = Math.max(0, 1 - MIN_VISIBLE_WIDTH - (base.cropRight ?? 0));
    return normalizeCrop({
      ...base,
      cropLeft: Math.max(0, Math.min(MAX_EDGE_CROP, maxLeft, x)),
    });
  }
  if (edge === "right") {
    const maxRight = Math.max(0, 1 - MIN_VISIBLE_WIDTH - (base.cropLeft ?? 0));
    return normalizeCrop({
      ...base,
      cropRight: Math.max(0, Math.min(MAX_EDGE_CROP, maxRight, 1 - x)),
    });
  }
  if (edge === "top") {
    const maxTop = Math.max(0, 1 - MIN_VISIBLE_HEIGHT - (base.cropBottom ?? 0));
    return normalizeCrop({
      ...base,
      cropTop: Math.max(0, Math.min(MAX_EDGE_CROP, maxTop, y)),
    });
  }
  const maxBottom = Math.max(0, 1 - MIN_VISIBLE_HEIGHT - (base.cropTop ?? 0));
  return normalizeCrop({
    ...base,
    cropBottom: Math.max(0, Math.min(MAX_EDGE_CROP, maxBottom, 1 - y)),
  });
}

export function normalizeSegments(
  segments: TrimSegment[],
  defaultSpeed = 1
): TrimSegment[] {
  const fallback = clampClipSpeed(defaultSpeed);
  return segments
    .map((s) => ({
      ...s,
      start: Math.max(0, s.start),
      end: Math.max(s.start + 0.2, s.end),
      speed: clampClipSpeed(
        typeof s.speed === "number" && Number.isFinite(s.speed) ? s.speed : fallback
      ),
    }))
    .filter((s) => s.end > s.start);
}

export function segmentsDuration(segments: TrimSegment[]) {
  return normalizeSegments(segments).reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** Wall-clock length of segments after each part's speed. */
export function segmentsPlayDuration(
  segments: TrimSegment[],
  defaultSpeed = 1
) {
  return normalizeSegments(segments, defaultSpeed).reduce((sum, s) => {
    const spd = clampClipSpeed(
      typeof s.speed === "number" && Number.isFinite(s.speed) ? s.speed : defaultSpeed
    );
    return sum + Math.max(0, s.end - s.start) / spd;
  }, 0);
}

export function defaultBedMusic(): ClipBedMusic {
  return {
    mediaId: null,
    mediaUrl: null,
    fileName: null,
    startAt: 0,
    volume: 0.35,
  };
}

/** Normalize / clear a per-clip bed. Returns undefined when no media is set. */
export function normalizeBedMusic(
  bed?: Partial<ClipBedMusic> | null
): ClipBedMusic | undefined {
  if (!bed?.mediaId) return undefined;
  const mediaId = String(bed.mediaId);
  let mediaUrl = bed.mediaUrl ?? null;
  if (!mediaUrl || mediaUrl.startsWith("blob:")) {
    if (mediaId.startsWith("music__")) {
      mediaUrl = `/api/music/file/${encodeURIComponent(mediaId.slice("music__".length))}`;
    } else {
      mediaUrl = `/api/media/${mediaId}`;
    }
  }
  const startAt =
    typeof bed.startAt === "number" && Number.isFinite(bed.startAt) ? Math.max(0, bed.startAt) : 0;
  const volume =
    typeof bed.volume === "number" && Number.isFinite(bed.volume)
      ? Math.max(0, Math.min(1, bed.volume))
      : 0.35;
  return {
    mediaId,
    mediaUrl,
    fileName: bed.fileName ?? null,
    startAt,
    volume,
  };
}

export function getClipBedMusic(clip: RankClip): ClipBedMusic | undefined {
  return normalizeBedMusic(clip.bedMusic);
}

export function createEmptyClip(rank: number): RankClip {
  const seg = createSegment(0, DEFAULT_CLIP_DURATION);
  return {
    id: uuidv4(),
    rank,
    label: "",
    mediaId: null,
    mediaUrl: null,
    fileName: null,
    sourceUrl: null,
    duration: 0,
    trimStart: seg.start,
    trimEnd: seg.end,
    segments: [seg],
    crop: defaultCrop(),
    volume: 1,
    speed: 1,
    gapAfter: 0,
    hookGapAfter: 0,
    status: "empty",
  };
}

/** Black hold after a clip (0–MAX_CLIP_GAP). */
export function clampClipGap(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(MAX_CLIP_GAP, Math.max(0, Math.round(seconds * 20) / 20));
}

export function getClipGapAfter(clip: RankClip) {
  return clampClipGap(typeof clip.gapAfter === "number" ? clip.gapAfter : 0);
}

/** Black hold after the hook teaser (0 unless a hook is set). */
export function getHookGapAfter(clip: RankClip) {
  if (!getClipHook(clip)) return 0;
  return clampClipGap(typeof clip.hookGapAfter === "number" ? clip.hookGapAfter : 0);
}

/** Built-in factory settings (before any user “Save as default layout”). */
export function builtInDefaultSettings(): ProjectSettings {
  return {
    title: {
      lines: [
        createLine([
          { text: "RANKING", color: "#FFFFFF" },
          { text: "BEST", color: "#FFFFFF" },
        ]),
        createLine([
          { text: "FALLING", color: "#39FF14" },
          { text: "MOMENTS", color: "#FFFFFF" },
        ]),
      ],
      fontId: "display",
      fontSize: 54,
      lineGap: 8,
      barOpacity: 0.72,
      showBar: true,
      barHeight: 150,
      enabled: true,
      x: 50,
      y: 2.2,
      align: "center",
      uppercase: true,
    },
    ranksLayout: {
      x: 3.5,
      y: 11,
      fontSize: 92,
      gap: 120,
      fontId: "display",
      labelSize: 42,
    },
    sticker: defaultSticker(),
    playOrder: "countdown",
    transition: "flash",
    transitionDuration: 0.25,
    aspectMode: "crop-fill",
    blurAmount: 28,
    titleOverlap: true,
    showRankList: true,
    showActiveLabel: true,
    rankColors: {
      1: "#FF2D2D",
      2: "#FF8A00",
      3: "#FFD400",
      4: "#FFFFFF",
      5: "#FFFFFF",
    },
    fps: 30,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    musicMediaId: null,
    musicUrl: null,
    musicVolume: 0.35,
    musicAutoFromFolder: false,
    clipVolume: 1,
  };
}

export function cloneSettings(settings: ProjectSettings): ProjectSettings {
  return JSON.parse(JSON.stringify(settings)) as ProjectSettings;
}

/**
 * Empty clips + layout settings. Pass saved layout settings so Reset keeps
 * title/ranks positioning instead of the built-in factory look.
 */
export function createDefaultProject(settings?: ProjectSettings): EditorProject {
  const ranks =
    (settings?.playOrder || "countdown") === "ascending" ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
  return {
    clips: ranks.map((rank) => createEmptyClip(rank)),
    sfxAssets: [],
    sfxPlacements: [],
    overlayPlacements: [],
    exportSlot: null,
    settings: settings ? cloneSettings(settings) : builtInDefaultSettings(),
  };
}

export function getPlaybackOrder(clips: RankClip[], playOrder: "countdown" | "ascending") {
  const sorted = [...clips].sort((a, b) =>
    playOrder === "countdown" ? b.rank - a.rank : a.rank - b.rank
  );
  return sorted.filter((c) => c.status === "ready" && c.mediaUrl);
}

/** Main trim parts only (what Trim & crop edits) — does not include hook. */
export function getClipMainSegments(clip: RankClip): TrimSegment[] {
  const fallback = getClipSpeed(clip);
  if (clip.segments?.length) return normalizeSegments(clip.segments, fallback);
  return [createSegment(clip.trimStart, clip.trimEnd, fallback)];
}

/** Normalize optional hook; returns undefined when disabled / invalid. */
export function normalizeHook(
  hook?: Partial<ClipHook> | null,
  sourceDuration = Infinity
): ClipHook | undefined {
  if (!hook) return undefined;
  if (!Number.isFinite(hook.start) || !Number.isFinite(hook.end)) return undefined;
  const maxEnd = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Infinity;
  let start = Math.max(0, hook.start as number);
  let end = Math.max(start + MIN_HOOK_DURATION, hook.end as number);
  if (Number.isFinite(maxEnd)) {
    end = Math.min(end, maxEnd);
    start = Math.min(start, Math.max(0, end - MIN_HOOK_DURATION));
  }
  const len = end - start;
  if (len < MIN_HOOK_DURATION - 1e-6) return undefined;
  if (len > MAX_HOOK_DURATION) {
    end = start + MAX_HOOK_DURATION;
  }
  return { start, end };
}

export function getClipHook(clip: RankClip): ClipHook | undefined {
  return normalizeHook(clip.hook, clip.duration || Infinity);
}

export function hookDuration(hook?: ClipHook | null) {
  if (!hook) return 0;
  return Math.max(0, hook.end - hook.start);
}

/**
 * Playback order: optional hook teaser, then main segments.
 * Used by preview, export, and timeline duration.
 */
export function getClipPlaybackSegments(clip: RankClip): TrimSegment[] {
  const main = getClipMainSegments(clip);
  const hook = getClipHook(clip);
  if (!hook) return main;
  // Hook teaser uses the clip-level default speed (no per-hook control yet)
  return [createSegment(hook.start, hook.end, getClipSpeed(clip)), ...main];
}

/** @deprecated Prefer getClipMainSegments or getClipPlaybackSegments */
export function getClipSegments(clip: RankClip): TrimSegment[] {
  return getClipMainSegments(clip);
}

export function getClipCrop(clip: RankClip): ClipCrop {
  return normalizeCrop(clip.crop);
}

/**
 * UI volume of 100% maps to this real gain on import/playback.
 * Keeps the clip volume slider at “100%” while sounding ~⅕ as loud as before.
 */
export const CLIP_VOLUME_UI_SCALE = 0.2;

/** Per-clip UI volume (0–2), default 1 (= 100% on the slider). */
export function getClipVolume(clip: RankClip) {
  return Math.max(0, Math.min(2, typeof clip.volume === "number" && Number.isFinite(clip.volume) ? clip.volume : 1));
}

/**
 * Real clip gain for preview/export:
 * UI volume × project master × {@link CLIP_VOLUME_UI_SCALE}.
 */
export function effectiveClipVolume(clip: RankClip, master = 1) {
  const m = Math.max(0, Math.min(2, Number.isFinite(master) ? master : 1));
  return Math.max(0, Math.min(2, getClipVolume(clip) * m * CLIP_VOLUME_UI_SCALE));
}

/** Clamp clip playback rate (0.5×–2×). */
export function clampClipSpeed(speed: number) {
  return Math.max(0.5, Math.min(2, Number.isFinite(speed) ? speed : 1));
}

export function getClipSpeed(clip: RankClip) {
  return clampClipSpeed(
    typeof clip.speed === "number" && Number.isFinite(clip.speed) ? clip.speed : 1
  );
}

/** Effective speed for one trim part (segment override → clip default). */
export function getSegmentSpeed(
  clip: RankClip,
  seg?: Pick<TrimSegment, "speed"> | null
) {
  if (seg && typeof seg.speed === "number" && Number.isFinite(seg.speed)) {
    return clampClipSpeed(seg.speed);
  }
  return getClipSpeed(clip);
}

/** Wall-clock length of one part after its speed. */
export function segmentPlayDuration(
  clip: RankClip,
  seg: Pick<TrimSegment, "start" | "end" | "speed">
) {
  return Math.max(0.05, Math.max(0, seg.end - seg.start) / getSegmentSpeed(clip, seg));
}

/** Selected source seconds (hook + main), before speed. Hook is extra on top of the 60s main budget. */
export function clipSourceDuration(clip: RankClip) {
  const main = Math.min(MAX_CLIP_DURATION, segmentsDuration(getClipMainSegments(clip)));
  const hook = hookDuration(getClipHook(clip));
  return Math.max(0.2, main + hook);
}

/** Wall-clock play length on the timeline (Σ part source ÷ part speed + optional hook black). */
export function clipPlayDuration(clip: RankClip) {
  const segs = getClipPlaybackSegments(clip);
  let play = 0;
  for (const s of segs) {
    play += segmentPlayDuration(clip, s);
  }
  return Math.max(0.2, play + getHookGapAfter(clip));
}

/**
 * Build an ffmpeg atempo chain for rate (0.5–2 per filter).
 * `speed` 2 = twice as fast (shorter).
 */
export function ffmpegAtempoChain(speed: number) {
  let rate = clampClipSpeed(speed);
  const parts: string[] = [];
  // Should already be in 0.5–2; keep chain logic for safety
  while (rate > 2.0001) {
    parts.push("atempo=2");
    rate /= 2;
  }
  while (rate < 0.4999) {
    parts.push("atempo=0.5");
    rate /= 0.5;
  }
  parts.push(`atempo=${Number(rate.toFixed(4))}`);
  return parts.join(",");
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export function displayWord(text: string, uppercase: boolean) {
  return uppercase ? text.toUpperCase() : text;
}

/**
 * How much larger a cover-fit is than a contain-fit (linear).
 * 16:9 in 9:16 ≈ 3.16; matching aspects → 1.
 */
export function coverContainFactor(frameAspect: number, videoAspect: number) {
  if (
    !Number.isFinite(frameAspect) ||
    !Number.isFinite(videoAspect) ||
    frameAspect <= 0 ||
    videoAspect <= 0
  ) {
    return 1;
  }
  return Math.max(frameAspect / videoAspect, videoAspect / frameAspect);
}

/**
 * Aspect ratio of the kept band after edge crop (source fractions).
 * Used when you intentionally want layout to follow the cropped picture.
 */
export function cropEffectiveAspect(
  videoAspect: number,
  crop?: Partial<ClipCrop> | null
) {
  const va =
    typeof videoAspect === "number" && Number.isFinite(videoAspect) && videoAspect > 0
      ? videoAspect
      : 9 / 16;
  const { top, bottom } = normalizeVerticalCrop(crop?.cropTop ?? 0, crop?.cropBottom ?? 0);
  const { left, right } = normalizeHorizontalCrop(crop?.cropLeft ?? 0, crop?.cropRight ?? 0);
  const visibleW = Math.max(0.2, 1 - left - right);
  const visibleH = Math.max(0.2, 1 - top - bottom);
  return (va * visibleW) / visibleH;
}

/**
 * CSS scale on top of object-fit:contain.
 * zoom=1 → full (cropped) source; zoom = coverContainFactor → fills Shorts frame.
 */
export function cropDisplayScale(
  zoom: number,
  _frameAspect: number,
  _videoAspect: number
) {
  return clampCropZoom(zoom);
}

/**
 * Pan as a CSS translate so dragging the video moves it visibly.
 * pan 50/50 = centered; 0 = bias toward left/top content; 100 = right/bottom.
 */
export function cropPanTranslatePct(crop: ClipCrop, scale: number) {
  const s = Math.max(0.25, scale);
  const strength = Math.max(10, (s - 1) * 55 + 14);
  return {
    x: ((50 - (crop.panX ?? 50)) / 50) * strength,
    y: ((50 - (crop.panY ?? 50)) / 50) * strength,
  };
}

/**
 * Normalized source-edge crop fractions.
 */
export function cropEdgeBars(crop?: Partial<ClipCrop> | null): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const { top, bottom } = normalizeVerticalCrop(
    crop?.cropTop ?? 0,
    crop?.cropBottom ?? 0
  );
  const { left, right } = normalizeHorizontalCrop(
    crop?.cropLeft ?? 0,
    crop?.cropRight ?? 0
  );
  return { top, bottom, left, right };
}

export type CropPreviewLayout = {
  /** Outer window in the 9:16 frame (contain × zoom × pan of the FULL source aspect). */
  windowStyle: {
    position: "absolute";
    width: string;
    height: string;
    left: string;
    top: string;
    overflow: "hidden";
    background: string;
  };
  /**
   * Black pad-back margins (as % of the window). Crop cuts those bands; the
   * subject under the remaining area keeps its scale (no nested % video box).
   */
  shades: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  /** Inner <video>: always fills the window; shades mask the cropped edges. */
  videoStyle: {
    position: "absolute";
    width: string;
    height: string;
    left: string;
    top: string;
    objectFit: "fill";
    maxWidth: string;
    maxHeight: string;
    background: string;
  };
};

/**
 * Crop-then-pan layout for preview.
 *
 * Matches export: edge-crop then pad black back to the original aspect, then
 * contain × zoom × pan. The window uses the FULL source aspect (sticker-safe).
 * Video fills that window; black shades cover the cropped margins so pan/zoom
 * never collapse the video element (nested % boxes were blanking the preview).
 */
export function cropPreviewStyle(
  crop: ClipCrop,
  opts?: { frameAspect?: number; videoAspect?: number }
): CropPreviewLayout {
  const frameAspect = opts?.frameAspect ?? 9 / 16;
  const rawVa = opts?.videoAspect;
  const videoAspect =
    typeof rawVa === "number" && Number.isFinite(rawVa) && rawVa > 0
      ? rawVa
      : frameAspect;
  const normalized = normalizeCrop(crop);
  const { top: ct, bottom: cb } = normalizeVerticalCrop(
    normalized.cropTop ?? 0,
    normalized.cropBottom ?? 0
  );
  const { left: cl, right: cr } = normalizeHorizontalCrop(
    normalized.cropLeft ?? 0,
    normalized.cropRight ?? 0
  );
  const z = clampCropZoom(normalized.zoom);

  // Layout from FULL source aspect (not cropped) so edge crop doesn't reflow
  // the Shorts frame and eat into the subscribe sticker safe area.
  let baseW: number;
  let baseH: number;
  if (videoAspect >= frameAspect) {
    baseW = 100;
    baseH = (100 * frameAspect) / videoAspect;
  } else {
    baseH = 100;
    baseW = (100 * videoAspect) / frameAspect;
  }
  const w = baseW * z;
  const h = baseH * z;

  const panX = normalized.panX / 100;
  const panY = normalized.panY / 100;
  const roomX = Math.max(w - 100, 100 * 0.45);
  const roomY = Math.max(h - 100, 100 * 0.45);
  const left = (100 - w) / 2 + (0.5 - panX) * roomX;
  const top = (100 - h) / 2 + (0.5 - panY) * roomY;

  return {
    windowStyle: {
      position: "absolute",
      width: `${w}%`,
      height: `${h}%`,
      left: `${left}%`,
      top: `${top}%`,
      overflow: "hidden",
      background: "#000",
    },
    shades: {
      left: cl * 100,
      right: cr * 100,
      top: ct * 100,
      bottom: cb * 100,
    },
    videoStyle: {
      position: "absolute",
      width: "100%",
      height: "100%",
      left: "0%",
      top: "0%",
      objectFit: "fill",
      maxWidth: "none",
      maxHeight: "none",
      background: "#000",
    },
  };
}

/** Clamp crop zoom into the supported range (1 = full frame; ~3+ fills 16:9→9:16). */
export function clampCropZoom(zoom: number) {
  return Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

/** Clamp framing pan (0–100, 50 = center). */
export function clampCropPan(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

/** Absolute timeline start for each ready clip in playback order */
export function clipTimelineOffsets(
  clips: RankClip[],
  playOrder: "countdown" | "ascending"
): { clipId: string; start: number; duration: number; gapAfter: number }[] {
  const order = getPlaybackOrder(clips, playOrder);
  let t = 0;
  return order.map((c, i) => {
    const duration = clipPlayDuration(c);
    const gapAfter = i < order.length - 1 ? getClipGapAfter(c) : 0;
    const row = { clipId: c.id, start: t, duration, gapAfter };
    t += duration + gapAfter;
    return row;
  });
}

export function totalTimelineDuration(
  clips: RankClip[],
  playOrder: "countdown" | "ascending"
) {
  return clipTimelineOffsets(clips, playOrder).reduce(
    (s, o) => s + o.duration + (o.gapAfter || 0),
    0
  );
}

export function resolveSfxStartAt(
  placement: { clipId: string | null; offsetInClip: number; startAt: number },
  offsets: { clipId: string; start: number; duration: number }[]
) {
  if (placement.clipId) {
    const hit = offsets.find((o) => o.clipId === placement.clipId);
    if (hit) {
      return hit.start + Math.max(0, Math.min(placement.offsetInClip, Math.max(0, hit.duration - 0.05)));
    }
  }
  return Math.max(0, placement.startAt);
}

/** Same clock as SFX — absolute timeline start for a timed overlay. */
export function resolveOverlayStartAt(
  placement: { clipId: string | null; offsetInClip: number; startAt: number },
  offsets: { clipId: string; start: number; duration: number }[]
) {
  return resolveSfxStartAt(placement, offsets);
}

const SNAP_STYLES: SnapTextStyle[] = ["classic", "box", "plain"];

export function normalizeSnapTextStyle(style?: string | null): SnapTextStyle {
  if (style === "box" || style === "plain" || style === "classic") return style;
  return "classic";
}

function clampOverlayPos(n: number, fallback = 50) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : fallback));
}

function clampOverlayScale(n: number, fallback = 1) {
  return Math.max(0.35, Math.min(3, Number.isFinite(n) ? n : fallback));
}

/** Clamp overlay rotation to −180…180 degrees. */
export function clampOverlayRotation(deg: number, fallback = 0) {
  if (!Number.isFinite(deg)) return fallback;
  // Normalize into (−180, 180]
  let d = ((deg + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return Math.max(-180, Math.min(180, d));
}

/** Shortest-path linear interpolation between two angles (degrees). */
export function lerpOverlayRotation(a: number, b: number, u: number) {
  const from = clampOverlayRotation(a, 0);
  const to = clampOverlayRotation(b, 0);
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return clampOverlayRotation(from + delta * Math.max(0, Math.min(1, u)), from);
}

/** Normalize / sort motion keypoints. Drops invalid entries; ensures unique ids. */
export function normalizeMotionPath(
  raw: OverlayMotionKeypoint[] | null | undefined
): OverlayMotionKeypoint[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const points = raw
    .map((k) => {
      if (!k || typeof k !== "object") return null;
      const t = Math.max(0, Math.min(1, Number.isFinite(k.t) ? Number(k.t) : 0));
      const x = clampOverlayPos(Number(k.x), 50);
      const y = clampOverlayPos(Number(k.y), 50);
      const point: OverlayMotionKeypoint = {
        id: typeof k.id === "string" && k.id ? k.id : uuidv4(),
        t,
        x,
        y,
      };
      if (k.scale != null && Number.isFinite(Number(k.scale))) {
        point.scale = clampOverlayScale(Number(k.scale), 1);
      }
      if (k.rotation != null && Number.isFinite(Number(k.rotation))) {
        point.rotation = clampOverlayRotation(Number(k.rotation), 0);
      }
      return point;
    })
    .filter(Boolean) as OverlayMotionKeypoint[];
  points.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  // Nudge duplicate t values so segments never have zero duration
  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) {
      points[i] = {
        ...points[i],
        t: Math.min(1, points[i - 1].t + 0.001),
      };
    }
  }
  return points;
}

/** Default start→end path from a static position (same spot until user edits). */
export function createDefaultMotionPath(
  x = 50,
  y = 50,
  scale?: number
): OverlayMotionKeypoint[] {
  const sx = clampOverlayPos(x, 50);
  const sy = clampOverlayPos(y, 50);
  const start: OverlayMotionKeypoint = { id: uuidv4(), t: 0, x: sx, y: sy };
  const end: OverlayMotionKeypoint = { id: uuidv4(), t: 1, x: sx, y: sy };
  if (scale != null && Number.isFinite(scale)) {
    const s = clampOverlayScale(scale, 1);
    start.scale = s;
    end.scale = s;
  }
  return [start, end];
}

export type OverlaySampledTransform = {
  x: number;
  y: number;
  scale: number;
  /** Degrees (−180…180). */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** True when a multi-point path is driving position. */
  animated: boolean;
};

/**
 * Sample overlay position/scale/rotation at a wall-clock time within its visible window.
 * `localTime` is seconds since the overlay appeared (0 … duration).
 * Flip is placement-level (constant while tracking); rotation may lerp along keypoints.
 */
export function sampleOverlayTransform(
  placement: Pick<
    OverlayPlacement,
    "x" | "y" | "scale" | "duration" | "motionPath" | "rotation" | "flipX" | "flipY"
  >,
  localTime: number
): OverlaySampledTransform {
  const baseScale = clampOverlayScale(placement.scale ?? 1, 1);
  const baseRot = clampOverlayRotation(placement.rotation ?? 0, 0);
  const flipX = Boolean(placement.flipX);
  const flipY = Boolean(placement.flipY);
  const baseX = clampOverlayPos(placement.x ?? 50, 50);
  const baseY = clampOverlayPos(placement.y ?? 50, 50);
  const path = normalizeMotionPath(placement.motionPath);
  if (path.length < 2) {
    if (path.length === 1) {
      return {
        x: path[0].x,
        y: path[0].y,
        scale: path[0].scale ?? baseScale,
        rotation: path[0].rotation ?? baseRot,
        flipX,
        flipY,
        animated: false,
      };
    }
    return {
      x: baseX,
      y: baseY,
      scale: baseScale,
      rotation: baseRot,
      flipX,
      flipY,
      animated: false,
    };
  }

  const dur = Math.max(0.2, placement.duration || 3);
  const progress = Math.max(0, Math.min(1, localTime / dur));

  if (progress <= path[0].t) {
    const p = path[0];
    return {
      x: p.x,
      y: p.y,
      scale: p.scale ?? baseScale,
      rotation: p.rotation ?? baseRot,
      flipX,
      flipY,
      animated: true,
    };
  }
  const last = path[path.length - 1];
  if (progress >= last.t) {
    return {
      x: last.x,
      y: last.y,
      scale: last.scale ?? baseScale,
      rotation: last.rotation ?? baseRot,
      flipX,
      flipY,
      animated: true,
    };
  }

  let i = 0;
  while (i < path.length - 1 && path[i + 1].t < progress) i++;
  const a = path[i];
  const b = path[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const u = Math.max(0, Math.min(1, (progress - a.t) / span));
  const scaleA = a.scale ?? baseScale;
  const scaleB = b.scale ?? baseScale;
  const rotA = a.rotation ?? baseRot;
  const rotB = b.rotation ?? baseRot;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    scale: scaleA + (scaleB - scaleA) * u,
    rotation: lerpOverlayRotation(rotA, rotB, u),
    flipX,
    flipY,
    animated: true,
  };
}

/** CSS transform for a sampled media overlay (center-anchored). */
export function overlayCssTransform(pose: Pick<OverlaySampledTransform, "scale" | "rotation" | "flipX" | "flipY">) {
  const s = clampOverlayScale(pose.scale ?? 1, 1);
  const sx = (pose.flipX ? -1 : 1) * s;
  const sy = (pose.flipY ? -1 : 1) * s;
  const r = clampOverlayRotation(pose.rotation ?? 0, 0);
  return `translate(-50%, -50%) rotate(${r}deg) scale(${sx}, ${sy})`;
}

/**
 * Build a piecewise-linear ffmpeg expression for one axis (0–1 normalized).
 * `t` in the expression is absolute timeline seconds.
 */
export function buildOverlayAxisExpr(
  path: OverlayMotionKeypoint[],
  overlayStart: number,
  duration: number,
  axis: "x" | "y",
  fallback01: number
): string {
  const pts = normalizeMotionPath(path);
  const dur = Math.max(0.2, duration);
  const fb = Math.max(0, Math.min(1, fallback01));
  if (pts.length === 0) return fb.toFixed(6);
  if (pts.length === 1) {
    const v = (axis === "x" ? pts[0].x : pts[0].y) / 100;
    return Math.max(0, Math.min(1, v)).toFixed(6);
  }

  // Nested if(lt(t, nextAbs), lerp, …)
  function lerpExpr(
    t0: number,
    v0: number,
    t1: number,
    v1: number
  ): string {
    const span = Math.max(1e-6, t1 - t0);
    // v0 + (v1-v0) * (t - t0) / span
    return `${v0.toFixed(6)}+(${(v1 - v0).toFixed(6)})*(t-${t0.toFixed(3)})/${span.toFixed(6)}`;
  }

  let expr = ((axis === "x" ? pts[pts.length - 1].x : pts[pts.length - 1].y) / 100).toFixed(6);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const t0 = overlayStart + a.t * dur;
    const t1 = overlayStart + b.t * dur;
    const v0 = (axis === "x" ? a.x : a.y) / 100;
    const v1 = (axis === "x" ? b.x : b.y) / 100;
    const segment = lerpExpr(t0, v0, t1, v1);
    // Before this segment's end, use lerp (or hold v0 if before t0 — handled by earlier points)
    expr = `if(lt(t\\,${t1.toFixed(3)})\\,${segment}\\,${expr})`;
  }
  // Hold first point before its time
  const first = pts[0];
  const tFirst = overlayStart + first.t * dur;
  const vFirst = ((axis === "x" ? first.x : first.y) / 100).toFixed(6);
  expr = `if(lt(t\\,${tFirst.toFixed(3)})\\,${vFirst}\\,${expr})`;
  return expr;
}

/**
 * Piecewise rotation (degrees) expression for ffmpeg `rotate=a='EXPR*PI/180'`.
 * Falls back to a constant when the path has no per-point rotation overrides.
 */
export function buildOverlayRotationExpr(
  path: OverlayMotionKeypoint[],
  overlayStart: number,
  duration: number,
  baseRotationDeg: number
): { expr: string; animated: boolean } {
  const pts = normalizeMotionPath(path);
  const base = clampOverlayRotation(baseRotationDeg, 0);
  const dur = Math.max(0.2, duration);
  const hasKeyed = pts.some((p) => p.rotation != null && Number.isFinite(p.rotation));
  if (!hasKeyed || pts.length < 2) {
    return { expr: base.toFixed(6), animated: false };
  }

  const rotAt = (p: OverlayMotionKeypoint) =>
    p.rotation != null ? clampOverlayRotation(p.rotation, base) : base;

  function lerpRotExpr(t0: number, a: number, t1: number, b: number): string {
    let delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const span = Math.max(1e-6, t1 - t0);
    return `${a.toFixed(6)}+(${delta.toFixed(6)})*(t-${t0.toFixed(3)})/${span.toFixed(6)}`;
  }

  let expr = rotAt(pts[pts.length - 1]).toFixed(6);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const t0 = overlayStart + a.t * dur;
    const t1 = overlayStart + b.t * dur;
    const segment = lerpRotExpr(t0, rotAt(a), t1, rotAt(b));
    expr = `if(lt(t\\,${t1.toFixed(3)})\\,${segment}\\,${expr})`;
  }
  const first = pts[0];
  const tFirst = overlayStart + first.t * dur;
  const vFirst = rotAt(first).toFixed(6);
  expr = `if(lt(t\\,${tFirst.toFixed(3)})\\,${vFirst}\\,${expr})`;
  return { expr, animated: true };
}

/** Insert a keypoint, keeping path sorted/normalized. */
export function upsertMotionKeypoint(
  path: OverlayMotionKeypoint[] | null | undefined,
  point: Partial<OverlayMotionKeypoint> & { t: number; x: number; y: number }
): OverlayMotionKeypoint[] {
  const next = normalizeMotionPath(path);
  const id = point.id || uuidv4();
  const existing = next.findIndex((p) => p.id === id);
  const kp: OverlayMotionKeypoint = {
    id,
    t: Math.max(0, Math.min(1, point.t)),
    x: clampOverlayPos(point.x, 50),
    y: clampOverlayPos(point.y, 50),
  };
  if (point.scale != null) kp.scale = clampOverlayScale(point.scale, 1);
  if (point.rotation != null) kp.rotation = clampOverlayRotation(point.rotation, 0);
  if (existing >= 0) next[existing] = kp;
  else next.push(kp);
  return normalizeMotionPath(next);
}

export function createOverlayPlacement(
  patch?: Partial<OverlayPlacement>
): OverlayPlacement {
  const kind = patch?.kind === "media" ? "media" : "text";
  const x = clampOverlayPos(Number(patch?.x), 50);
  const y = clampOverlayPos(Number(patch?.y), 50);
  const scale = clampOverlayScale(Number(patch?.scale), 1);
  const rotation =
    kind === "media" ? clampOverlayRotation(Number(patch?.rotation ?? 0), 0) : 0;
  const flipX = kind === "media" ? Boolean(patch?.flipX) : false;
  const flipY = kind === "media" ? Boolean(patch?.flipY) : false;
  const motionPath =
    kind === "media" ? normalizeMotionPath(patch?.motionPath) : [];
  // Keep static x/y aligned with the first keypoint when a path exists
  const syncX = motionPath.length > 0 ? motionPath[0].x : x;
  const syncY = motionPath.length > 0 ? motionPath[0].y : y;
  return {
    id: patch?.id || uuidv4(),
    kind,
    startAt: Math.max(0, Number.isFinite(patch?.startAt) ? Number(patch?.startAt) : 0),
    clipId: patch?.clipId ?? null,
    offsetInClip: Math.max(0, Number.isFinite(patch?.offsetInClip) ? Number(patch?.offsetInClip) : 0),
    duration: Math.max(
      0.3,
      Math.min(30, Number.isFinite(patch?.duration) ? Number(patch?.duration) : 3)
    ),
    x: syncX,
    y: syncY,
    scale,
    rotation,
    flipX,
    flipY,
    motionPath: motionPath.length > 0 ? motionPath : undefined,
    text: typeof patch?.text === "string" ? patch.text : kind === "text" ? "Type here 😂" : "",
    textStyle: normalizeSnapTextStyle(patch?.textStyle),
    color: typeof patch?.color === "string" && patch.color.trim() ? patch.color : "#FFFFFF",
    showBackground: patch?.showBackground !== false,
    mediaId: patch?.mediaId ?? null,
    mediaUrl: patch?.mediaUrl ?? null,
    fileName: patch?.fileName ?? null,
  };
}

export function normalizeOverlayPlacement(
  raw: Partial<OverlayPlacement> | null | undefined
): OverlayPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  return createOverlayPlacement(raw);
}

/** Combined sample gain × hit gain for preview/export */
export function effectiveSfxVolume(
  assetVolume: number | undefined,
  placementVolume: number | undefined
) {
  const a = typeof assetVolume === "number" && Number.isFinite(assetVolume) ? assetVolume : 1;
  const p =
    typeof placementVolume === "number" && Number.isFinite(placementVolume) ? placementVolume : 1;
  return Math.max(0, Math.min(3, a * p));
}

/** Cycle Snapchat text styles the way the in-app carousel does. */
export function nextSnapTextStyle(current: SnapTextStyle): SnapTextStyle {
  const i = SNAP_STYLES.indexOf(current);
  return SNAP_STYLES[(i + 1) % SNAP_STYLES.length];
}

/** Wall-clock progress into the clip from a source-time playhead. */
export function clipLocalPlayProgress(
  clip: RankClip,
  segIndex: number,
  sourceTime: number
) {
  const segs = getClipPlaybackSegments(clip);
  const hook = getClipHook(clip);
  const hookGap = getHookGapAfter(clip);
  let t = 0;
  for (let i = 0; i < segIndex; i++) {
    const s = segs[i];
    if (s) t += segmentPlayDuration(clip, s);
    // Black hold after the hook teaser (first playback segment)
    if (hook && i === 0) t += hookGap;
  }
  const seg = segs[segIndex];
  if (seg) {
    const into = Math.max(0, Math.min(sourceTime, seg.end) - seg.start);
    t += into / getSegmentSpeed(clip, seg);
  }
  return t;
}

/** Map a wall-clock local play offset back to source seek + segment index. */
export function sourceSeekFromLocalPlay(clip: RankClip, localPlay: number) {
  const segs = getClipPlaybackSegments(clip);
  if (segs.length === 0) {
    return { segIndex: 0, sourceTime: 0, inHookGap: false };
  }
  const hook = getClipHook(clip);
  const hookGap = getHookGapAfter(clip);
  let remaining = Math.max(0, localPlay);
  for (let i = 0; i < segs.length; i++) {
    const playLen = segmentPlayDuration(clip, segs[i]);
    if (remaining <= playLen) {
      const speed = getSegmentSpeed(clip, segs[i]);
      const sourceInto = Math.min(
        remaining * speed,
        Math.max(0, segs[i].end - segs[i].start)
      );
      return {
        segIndex: i,
        sourceTime: segs[i].start + sourceInto,
        inHookGap: false,
      };
    }
    remaining -= playLen;
    if (hook && i === 0 && hookGap > 0) {
      if (remaining <= hookGap) {
        return {
          segIndex: 0,
          sourceTime: segs[0].end,
          inHookGap: true,
          hookGapElapsed: remaining,
        };
      }
      remaining -= hookGap;
    }
    if (i === segs.length - 1) {
      return {
        segIndex: i,
        sourceTime: segs[i].end,
        inHookGap: false,
      };
    }
  }
  const last = segs[segs.length - 1];
  return { segIndex: segs.length - 1, sourceTime: last.start, inHookGap: false };
}

export function absoluteTimeForClipPlayhead(
  clipId: string,
  localPlay: number,
  offsets: { clipId: string; start: number; duration: number }[]
) {
  const hit = offsets.find((o) => o.clipId === clipId);
  if (!hit) return Math.max(0, localPlay);
  return hit.start + Math.max(0, Math.min(localPlay, hit.duration));
}

export function findClipAtAbsoluteTime(
  absTime: number,
  offsets: { clipId: string; start: number; duration: number; gapAfter?: number }[]
): {
  clipId: string;
  start: number;
  duration: number;
  gapAfter: number;
  inGap: boolean;
} | null {
  if (offsets.length === 0) return null;
  const t = Math.max(0, absTime);
  for (const o of offsets) {
    const gap = Math.max(0, o.gapAfter || 0);
    const end = o.start + o.duration + gap;
    if (t >= o.start && t < end) {
      return {
        clipId: o.clipId,
        start: o.start,
        duration: o.duration,
        gapAfter: gap,
        inGap: t >= o.start + o.duration - 1e-6 && gap > 0,
      };
    }
  }
  const last = offsets[offsets.length - 1]!;
  return {
    clipId: last.clipId,
    start: last.start,
    duration: last.duration,
    gapAfter: Math.max(0, last.gapAfter || 0),
    inGap: false,
  };
}

