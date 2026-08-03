import { v4 as uuidv4 } from "uuid";
import type {
  ClipBedMusic,
  ClipCrop,
  ClipHook,
  EditorProject,
  ProjectSettings,
  RankClip,
  StickerOverlay,
  TitleLine,
  TitleWord,
  TrimSegment,
} from "./types";
import {
  DEFAULT_CLIP_DURATION,
  MAX_CLIP_DURATION,
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

export function createSegment(start: number, end: number): TrimSegment {
  return { id: uuidv4(), start, end };
}

/** Max fraction of height removable from one edge */
export const MAX_EDGE_CROP = 0.45;
/** Keep at least this much of the source height after top+bottom crop */
export const MIN_VISIBLE_HEIGHT = 0.2;

export function defaultCrop(): ClipCrop {
  return { zoom: 1, panX: 50, panY: 50, cropTop: 0, cropBottom: 0 };
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

/** Merge partial/legacy crop with defaults and clamp all fields. */
export function normalizeCrop(crop?: Partial<ClipCrop> | null): ClipCrop {
  const d = defaultCrop();
  const edges = normalizeVerticalCrop(crop?.cropTop ?? 0, crop?.cropBottom ?? 0);
  const panX = typeof crop?.panX === "number" && Number.isFinite(crop.panX) ? crop.panX : d.panX;
  const panY = typeof crop?.panY === "number" && Number.isFinite(crop.panY) ? crop.panY : d.panY;
  return {
    zoom: clampCropZoom(crop?.zoom ?? d.zoom),
    panX: Math.max(0, Math.min(100, panX)),
    panY: Math.max(0, Math.min(100, panY)),
    cropTop: edges.top,
    cropBottom: edges.bottom,
  };
}

export function normalizeSegments(segments: TrimSegment[]): TrimSegment[] {
  return segments
    .map((s) => ({
      ...s,
      start: Math.max(0, s.start),
      end: Math.max(s.start + 0.2, s.end),
    }))
    .filter((s) => s.end > s.start);
}

export function segmentsDuration(segments: TrimSegment[]) {
  return normalizeSegments(segments).reduce((sum, s) => sum + (s.end - s.start), 0);
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
    status: "empty",
  };
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
  if (clip.segments?.length) return normalizeSegments(clip.segments);
  return [createSegment(clip.trimStart, clip.trimEnd)];
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
  return [createSegment(hook.start, hook.end), ...main];
}

/** @deprecated Prefer getClipMainSegments or getClipPlaybackSegments */
export function getClipSegments(clip: RankClip): TrimSegment[] {
  return getClipMainSegments(clip);
}

export function getClipCrop(clip: RankClip): ClipCrop {
  return normalizeCrop(clip.crop);
}

/** Per-clip volume (0–2), default 1 */
export function getClipVolume(clip: RankClip) {
  return Math.max(0, Math.min(2, typeof clip.volume === "number" && Number.isFinite(clip.volume) ? clip.volume : 1));
}

/** Clip gain × project master clipVolume */
export function effectiveClipVolume(clip: RankClip, master = 1) {
  const m = Math.max(0, Math.min(2, Number.isFinite(master) ? master : 1));
  return Math.max(0, Math.min(2, getClipVolume(clip) * m));
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

/** Selected source seconds (hook + main), before speed. Hook is extra on top of the 60s main budget. */
export function clipSourceDuration(clip: RankClip) {
  const main = Math.min(MAX_CLIP_DURATION, segmentsDuration(getClipMainSegments(clip)));
  const hook = hookDuration(getClipHook(clip));
  return Math.max(0.2, main + hook);
}

/** Wall-clock play length on the timeline (= source ÷ speed). */
export function clipPlayDuration(clip: RankClip) {
  return Math.max(0.2, clipSourceDuration(clip) / getClipSpeed(clip));
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
 * CSS scale applied on top of object-fit:contain so zoom=1 matches cover-fill,
 * and values just below 1 only nudge out slightly (no sudden shrink).
 */
export function cropDisplayScale(
  zoom: number,
  frameAspect: number,
  videoAspect: number
) {
  const z = clampCropZoom(zoom);
  const cover = coverContainFactor(frameAspect, videoAspect);
  return cover * z;
}

/**
 * Pan as a CSS translate so dragging the video moves it visibly.
 * pan 50/50 = centered; 0 = bias toward left/top content; 100 = right/bottom.
 */
export function cropPanTranslatePct(crop: ClipCrop, scale: number) {
  const s = Math.max(0.25, scale);
  // More room to pan when punched in past the frame
  const strength = Math.max(10, (s - 1) * 55 + 14);
  return {
    x: ((50 - (crop.panX ?? 50)) / 50) * strength,
    y: ((50 - (crop.panY ?? 50)) / 50) * strength,
  };
}

/**
 * Effective source aspect after vertical edge crop (width unchanged, height shrinks).
 */
export function cropEffectiveAspect(videoAspect: number, crop: ClipCrop) {
  const { visibleH } = normalizeVerticalCrop(crop.cropTop, crop.cropBottom);
  if (!Number.isFinite(videoAspect) || videoAspect <= 0) return 16 / 9;
  return videoAspect / visibleH;
}

export function cropPreviewStyle(
  crop: ClipCrop,
  opts?: { frameAspect?: number; videoAspect?: number }
) {
  const frameAspect = opts?.frameAspect ?? 9 / 16;
  const videoAspect = opts?.videoAspect ?? frameAspect;
  const normalized = normalizeCrop(crop);
  const { top, visibleH } = normalizeVerticalCrop(
    normalized.cropTop,
    normalized.cropBottom
  );
  // Treat the kept band as the source so cover/zoom match export's crop→scale chain
  const effectiveAspect = cropEffectiveAspect(videoAspect, normalized);
  const scale = cropDisplayScale(normalized.zoom, frameAspect, effectiveAspect);
  const pan = cropPanTranslatePct(normalized, scale);

  // Asymmetric top/bottom: shift so the kept band stays centered before pan
  const visibleCenter = top + visibleH / 2;
  const containHFrac = Math.min(1, frameAspect / Math.max(videoAspect, 0.01));
  const edgeBiasY = (0.5 - visibleCenter) * containHFrac * 100;

  return {
    // Contain + scale(coverFactor*zoom): zoom=1 fills like cover; zoom out is continuous
    objectFit: "contain" as const,
    objectPosition: "50% 50%",
    // translate then scale (CSS applies right-to-left) so drag offsets feel natural
    transform: `scale(${scale}) translate(${pan.x}%, ${pan.y + edgeBiasY}%)`,
    transformOrigin: "center center",
    width: "100%",
    height: "100%",
    willChange: "transform",
  };
}

/** Clamp crop zoom into the supported range */
export function clampCropZoom(zoom: number) {
  return Math.max(0.25, Math.min(3, Number.isFinite(zoom) ? zoom : 1));
}

/** Absolute timeline start for each ready clip in playback order */
export function clipTimelineOffsets(
  clips: RankClip[],
  playOrder: "countdown" | "ascending"
): { clipId: string; start: number; duration: number }[] {
  const order = getPlaybackOrder(clips, playOrder);
  let t = 0;
  return order.map((c) => {
    const duration = clipPlayDuration(c);
    const row = { clipId: c.id, start: t, duration };
    t += duration;
    return row;
  });
}

export function totalTimelineDuration(
  clips: RankClip[],
  playOrder: "countdown" | "ascending"
) {
  return getPlaybackOrder(clips, playOrder).reduce((s, c) => s + clipPlayDuration(c), 0);
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

/** How far into a clip's *played* timeline we are (merged segments). */
/** Wall-clock progress into the clip from a source-time playhead. */
export function clipLocalPlayProgress(
  clip: RankClip,
  segIndex: number,
  sourceTime: number
) {
  const segs = getClipPlaybackSegments(clip);
  let t = 0;
  for (let i = 0; i < segIndex; i++) {
    const s = segs[i];
    if (s) t += Math.max(0, s.end - s.start);
  }
  const seg = segs[segIndex];
  if (seg) {
    t += Math.max(0, Math.min(sourceTime, seg.end) - seg.start);
  }
  return t / getClipSpeed(clip);
}

/** Map a wall-clock local play offset back to source seek + segment index. */
export function sourceSeekFromLocalPlay(clip: RankClip, localPlay: number) {
  const segs = getClipPlaybackSegments(clip);
  if (segs.length === 0) return { segIndex: 0, sourceTime: 0 };
  let remaining = Math.max(0, localPlay) * getClipSpeed(clip);
  for (let i = 0; i < segs.length; i++) {
    const len = Math.max(0.05, segs[i].end - segs[i].start);
    if (remaining <= len || i === segs.length - 1) {
      return {
        segIndex: i,
        sourceTime: segs[i].start + Math.min(remaining, len),
      };
    }
    remaining -= len;
  }
  const last = segs[segs.length - 1];
  return { segIndex: segs.length - 1, sourceTime: last.start };
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
  offsets: { clipId: string; start: number; duration: number }[]
) {
  if (offsets.length === 0) return null;
  const t = Math.max(0, absTime);
  for (const o of offsets) {
    if (t >= o.start && t < o.start + o.duration) return o;
  }
  return offsets[offsets.length - 1];
}

