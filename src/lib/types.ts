export type TransitionType = "cut" | "flash" | "zoom";
export type PlayOrder = "countdown" | "ascending";
export type AspectMode = "blur-pad" | "crop-fill";

export interface RankClip {
  id: string;
  rank: number;
  label: string;
  /** Server media id once uploaded/downloaded */
  mediaId: string | null;
  /** Blob/object URL or /api/media/:id for playback */
  mediaUrl: string | null;
  fileName: string | null;
  sourceUrl: string | null;
  duration: number;
  trimStart: number;
  trimEnd: number;
  status: "empty" | "loading" | "ready" | "error";
  error?: string;
}

export interface TitleConfig {
  prefix: string;
  highlight: string;
  suffix: string;
  highlightColor: string;
  barOpacity: number;
}

export interface ProjectSettings {
  title: TitleConfig;
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
