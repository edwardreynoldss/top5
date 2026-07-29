export type TransitionType = "cut" | "flash" | "zoom";
export type PlayOrder = "countdown" | "ascending";
export type AspectMode = "blur-pad" | "crop-fill";
export type TextAlign = "left" | "center" | "right";

export interface TrimSegment {
  id: string;
  start: number;
  end: number;
}

/** Zoom/pan framing for fit-to-screen crop */
export interface ClipCrop {
  /** 1 = normal fill, up to 3 = zoom in */
  zoom: number;
  /** 0–100 horizontal focus (50 = center) */
  panX: number;
  /** 0–100 vertical focus (50 = center) */
  panY: number;
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

export interface ProjectSettings {
  title: TitleConfig;
  ranksLayout: RankLayout;
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
  clipVolume: number;
}

/** Uploaded sound-effect sample (vine boom, GET OUT, etc.) */
export interface SfxAsset {
  id: string;
  mediaId: string;
  mediaUrl: string;
  fileName: string;
  duration: number;
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

export interface EditorProject {
  clips: RankClip[];
  settings: ProjectSettings;
  sfxAssets: SfxAsset[];
  sfxPlacements: SfxPlacement[];
}

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const DEFAULT_CLIP_DURATION = 4;
export const MAX_CLIP_DURATION = 60;

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
