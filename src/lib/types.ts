export type TransitionType = "cut" | "flash" | "zoom";
export type PlayOrder = "countdown" | "ascending";
export type AspectMode = "blur-pad" | "crop-fill";
export type TextAlign = "left" | "center" | "right";

export interface TrimSegment {
  id: string;
  start: number;
  end: number;
  /**
   * Playback rate for this part only (0.5–2). When omitted, falls back to clip.speed.
   * Split parts can each have their own speed.
   */
  speed?: number;
}

/** Zoom/pan framing for fit-to-screen crop, plus optional edge crop */
export interface ClipCrop {
  /**
   * Continuous zoom on top of fit-entire (object-fit contain).
   * 1 = full source frame (1:1 — keeps baked black bars),
   * above 1 = punch in (at coverContainFactor the Shorts frame is filled),
   * below 1 = zoom out further.
   */
  zoom: number;
  /** 0–100 horizontal focus (50 = center) */
  panX: number;
  /** 0–100 vertical focus (50 = center) */
  panY: number;
  /**
   * Fraction of the SOURCE height to cut from the top (0–0.45).
   * Applied to the video before pan/zoom — the crop moves with the clip.
   */
  cropTop?: number;
  /**
   * Fraction of the SOURCE height to cut from the bottom (0–0.45).
   * Applied to the video before pan/zoom — the crop moves with the clip.
   */
  cropBottom?: number;
  /**
   * Fraction of the SOURCE width to cut from the left (0–0.45).
   * Applied to the video before pan/zoom — the crop moves with the clip.
   */
  cropLeft?: number;
  /**
   * Fraction of the SOURCE width to cut from the right (0–0.45).
   * Applied to the video before pan/zoom — the crop moves with the clip.
   */
  cropRight?: number;
}

/** Optional background bed for a single clip (from music/ folder). */
export interface ClipBedMusic {
  mediaId: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  /** Start offset into the bed source (seconds). */
  startAt: number;
  /** 0–1 bed gain under this clip. */
  volume: number;
}

/**
 * Optional hook snippet from the same source that plays before the main trim.
 * Used for a short “first impression” before the full chosen clip.
 */
export interface ClipHook {
  start: number;
  end: number;
}

export interface RankClip {
  id: string;
  rank: number;
  label: string;
  mediaId: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  sourceUrl: string | null;
  duration: number;
  /** @deprecated derived from segments[0] — kept for compatibility */
  trimStart: number;
  trimEnd: number;
  /** One or more ranges that are merged in playback/export */
  segments: TrimSegment[];
  crop: ClipCrop;
  /**
   * Per-clip UI gain 0–2 (1 = 100% on the slider).
   * Real playback uses UI × project clipVolume × 0.2 so default 100% is quieter on import.
   */
  volume: number;
  /**
   * Default playback rate 0.5–2 (1 = normal).
   * Used for parts without their own speed, and as the ClipCard master control.
   * Timeline length = Σ (part source ÷ part speed).
   */
  speed: number;
  /**
   * Optional bed from music/ for this clip only.
   * Plays under the clip and is hard-capped to the clip's wall-clock duration.
   */
  bedMusic?: ClipBedMusic;
  /**
   * When true, Look background music is silent for this clip’s play window
   * (hook + main). Music continues again after the clip finishes (incl. during
   * the black gap after). Use when the clip already has its own bed/audio.
   */
  muteLookMusic?: boolean;
  /** Optional short teaser played before the main segments (same source). */
  hook?: ClipHook;
  /**
   * Black hold (seconds) AFTER the optional hook teaser, before main parts.
   * Title/ranks stay; video is black. Ignored when there is no hook.
   */
  hookGapAfter?: number;
  /**
   * Black hold (seconds) AFTER this clip, before the next in playback order.
   * Title/ranks overlays stay; video is black. Ignored for the last ready clip.
   */
  gapAfter?: number;
  status: "empty" | "loading" | "ready" | "error";
  error?: string;
}

export interface TitleWord {
  id: string;
  text: string;
  color: string;
}

export interface TitleLine {
  id: string;
  words: TitleWord[];
}

export type TitleFontId =
  | "display"
  | "impact"
  | "bebas"
  | "montserrat"
  | "inter"
  | "oswald";

export interface TitleConfig {
  lines: TitleLine[];
  fontId: TitleFontId;
  fontSize: number;
  lineGap: number;
  barOpacity: number;
  showBar: boolean;
  barHeight: number;
  /** When false, hide title text + bar completely (preview + export). */
  enabled: boolean;
  x: number;
  y: number;
  align: TextAlign;
  uppercase: boolean;
}

export interface RankLayout {
  x: number;
  y: number;
  fontSize: number;
  gap: number;
  fontId: TitleFontId;
  labelSize: number;
}

/**
 * Animated bottom sticker (transparent WebM / VP9 alpha).
 * Plays once at an absolute timeline time (default 20s) — not looping.
 * Always muted (no audio).
 */
export interface StickerOverlay {
  enabled: boolean;
  mediaId: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  /** Relative size vs natural width (0.15–2). 1 ≈ full frame width. */
  scale: number;
  /** Playback rate (0.25–3). 1 = native speed. */
  speed: number;
  /**
   * Absolute timeline seconds when the sticker should appear.
   * Default 20.
   */
  startAt: number;
  /** Native media duration in seconds (from upload probe). */
  duration: number;
  /** Has real alpha channel (VP9 yuva / alpha_mode). */
  hasAlpha: boolean;
}

export interface ProjectSettings {
  title: TitleConfig;
  ranksLayout: RankLayout;
  sticker: StickerOverlay;
  playOrder: PlayOrder;
  transition: TransitionType;
  transitionDuration: number;
  aspectMode: AspectMode;
  blurAmount: number;
  /**
   * true = video fills full frame and title overlays it
   * false = video starts below the title bar
   */
  titleOverlap: boolean;
  showRankList: boolean;
  showActiveLabel: boolean;
  rankColors: Record<number, string>;
  fps: number;
  width: number;
  height: number;
  musicMediaId: string | null;
  musicUrl: string | null;
  musicVolume: number;
  /**
   * When true and no music is selected, auto-pick a bed from the music/ folder.
   */
  musicAutoFromFolder: boolean;
  clipVolume: number;
}

/** Uploaded sound-effect sample (vine boom, GET OUT, etc.) */
export interface SfxAsset {
  id: string;
  mediaId: string;
  mediaUrl: string;
  fileName: string;
  duration: number;
  /** Overall sample gain (persisted) — some uploads are louder than others */
  volume: number;
}

/** Where / how an SFX plays in the final video */
export interface SfxPlacement {
  id: string;
  assetId: string;
  /** Absolute time on final timeline (seconds) when not pinned to a clip */
  startAt: number;
  /** Pin to a rank clip — uses offsetInClip instead of startAt */
  clipId: string | null;
  /** Seconds from the start of that clip’s playback */
  offsetInClip: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
}

/**
 * Snapchat-style caption look.
 * Classic = full-width translucent bar (the iconic Snap caption).
 * Box = rounded pill behind the text only (modern Snap background).
 * Plain = text only, no bar.
 *
 * Font: Public Sans (OFL) — the standard free substitute for proprietary Snapchat Sans
 * used by editors like Kapwing; we cannot redistribute Snapchat Sans itself.
 */
export type SnapTextStyle = "classic" | "box" | "plain";

/**
 * One waypoint on an overlay motion path.
 * `t` is normalized 0–1 within the overlay’s on-screen duration
 * (0 = appear / start point, 1 = disappear / end point).
 */
export interface OverlayMotionKeypoint {
  id: string;
  t: number;
  x: number;
  y: number;
  /** Optional size at this point; omit to keep the placement scale. */
  scale?: number;
  /** Optional rotation degrees at this point; omit to keep placement rotation. */
  rotation?: number;
}

/** Timed text box or media object (arrow/circle GIF, etc.) on the timeline. */
export interface OverlayPlacement {
  id: string;
  kind: "text" | "media";
  /** Absolute timeline seconds when not pinned to a clip */
  startAt: number;
  clipId: string | null;
  offsetInClip: number;
  /** How long the overlay stays on screen (wall-clock seconds) */
  duration: number;
  /** Horizontal position 0–100 (50 = center). Classic text ignores X for the bar. */
  x: number;
  /** Vertical position 0–100 (50 = middle of frame). */
  y: number;
  /** Relative size (text font scale / media scale). 1 = default. */
  scale: number;
  /** Rotation in degrees (−180…180). Media objects only. */
  rotation: number;
  /** Mirror horizontally. Media objects only. */
  flipX: boolean;
  /** Mirror vertically. Media objects only. */
  flipY: boolean;
  /**
   * Optional multi-point motion path (media objects).
   * Empty / omitted = static at x,y for the whole duration.
   * 2+ points = interpolate (linear) between waypoints over time.
   */
  motionPath?: OverlayMotionKeypoint[];
  /** Caption text (supports emoji). */
  text: string;
  textStyle: SnapTextStyle;
  /** Hex text color (classic Snap is white). */
  color: string;
  /** Show the translucent background bar/pill. */
  showBackground: boolean;
  /** Media object (GIF/PNG/WebM) — for kind === "media" */
  mediaId: string | null;
  mediaUrl: string | null;
  fileName: string | null;
}

export interface EditorProject {
  clips: RankClip[];
  settings: ProjectSettings;
  sfxAssets: SfxAsset[];
  sfxPlacements: SfxPlacement[];
  /** Timed Snapchat-style text / stickers / GIFs on the preview + export. */
  overlayPlacements: OverlayPlacement[];
  /**
   * Export identity for the current clip set (cleared on Reset).
   * First export → ranking-{channel}-{n}; re-export → ranking-{channel}-{n}.{v}
   */
  exportSlot?: {
    channelSlug: string;
    number: number;
    version: number;
  } | null;
}

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const DEFAULT_CLIP_DURATION = 4;
export const MAX_CLIP_DURATION = 60;
/** Max length of an optional hook teaser (seconds). */
export const MAX_HOOK_DURATION = 3;
/** Min length of an optional hook teaser (seconds). */
export const MIN_HOOK_DURATION = 0.5;
/** Max black hold between clips (seconds). */
export const MAX_CLIP_GAP = 10;

export const TITLE_FONTS: {
  id: TitleFontId;
  label: string;
  css: string;
  file: string;
}[] = [
  {
    id: "display",
    label: "Display Black",
    css: 'var(--font-display-google), "Noto Sans Display", "Arial Black", sans-serif',
    file: "assets/fonts/NotoSansDisplay-Bold.ttf",
  },
  {
    id: "impact",
    label: "Impact / Heavy",
    css: 'Impact, "Arial Black", Haettenschweiler, sans-serif',
    file: "assets/fonts/LiberationSans-Bold.ttf",
  },
  {
    id: "bebas",
    label: "Condensed Caps",
    css: 'var(--font-oswald), "Oswald", "Arial Narrow", sans-serif',
    file: "assets/fonts/NotoSansDisplay-Bold.ttf",
  },
  {
    id: "montserrat",
    label: "Montserrat Bold",
    css: 'var(--font-montserrat), "Montserrat", "Avenir Next", sans-serif',
    file: "assets/fonts/Inter-Bold.ttf",
  },
  {
    id: "inter",
    label: "Inter Bold",
    css: 'var(--font-inter), Inter, "Helvetica Neue", sans-serif',
    file: "assets/fonts/Inter-Bold.ttf",
  },
  {
    id: "oswald",
    label: "Oswald",
    css: 'var(--font-oswald), "Oswald", "Arial Narrow", sans-serif',
    file: "assets/fonts/JetBrainsMono-Bold.ttf",
  },
];

export function fontCss(id: TitleFontId) {
  return TITLE_FONTS.find((f) => f.id === id)?.css || TITLE_FONTS[0].css;
}

export function fontFile(id: TitleFontId) {
  return TITLE_FONTS.find((f) => f.id === id)?.file || TITLE_FONTS[0].file;
}
