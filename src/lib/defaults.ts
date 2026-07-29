import { v4 as uuidv4 } from "uuid";
import type { EditorProject, RankClip, TitleLine, TitleWord, TrimSegment } from "./types";
import { DEFAULT_CLIP_DURATION, MAX_CLIP_DURATION, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "./types";

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
    status: "empty",
  };
}

export function createDefaultProject(): EditorProject {
  return {
    clips: [5, 4, 3, 2, 1].map((rank) => createEmptyClip(rank)),
    settings: {
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
      playOrder: "countdown",
      transition: "flash",
      transitionDuration: 0.25,
      aspectMode: "crop-fill",
      blurAmount: 28,
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
      clipVolume: 1,
    },
  };
}

export function getPlaybackOrder(clips: RankClip[], playOrder: "countdown" | "ascending") {
  const sorted = [...clips].sort((a, b) =>
    playOrder === "countdown" ? b.rank - a.rank : a.rank - b.rank
  );
  return sorted.filter((c) => c.status === "ready" && c.mediaUrl);
}

export function getClipSegments(clip: RankClip): TrimSegment[] {
  if (clip.segments?.length) return normalizeSegments(clip.segments);
  return [createSegment(clip.trimStart, clip.trimEnd)];
}

export function clipPlayDuration(clip: RankClip) {
  return Math.max(0.2, Math.min(MAX_CLIP_DURATION, segmentsDuration(getClipSegments(clip))));
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
