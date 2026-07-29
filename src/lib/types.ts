export type TransitionType = "cut" | "flash" | "zoom";
export type PlayOrder = "countdown" | "ascending";
export type AspectMode = "blur-pad" | "crop-fill";
export type TextAlign = "left" | "center" | "right";

export interface TrimSegment {
  id: string;
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

export interface EditorProject {
  clips: RankClip[];
  settings: ProjectSettings;
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
