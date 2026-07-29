import { v4 as uuidv4 } from "uuid";
import type { EditorProject, RankClip } from "./types";
import { DEFAULT_CLIP_DURATION, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "./types";

export function createEmptyClip(rank: number): RankClip {
  return {
    id: uuidv4(),
    rank,
    label: "",
    mediaId: null,
    mediaUrl: null,
    fileName: null,
    sourceUrl: null,
    duration: 0,
    trimStart: 0,
    trimEnd: DEFAULT_CLIP_DURATION,
    status: "empty",
  };
}

export function createDefaultProject(): EditorProject {
  return {
    clips: [5, 4, 3, 2, 1].map((rank) => createEmptyClip(rank)),
    settings: {
      title: {
        prefix: "RANKING BEST",
        highlight: "FALLING",
        suffix: "MOMENTS",
        highlightColor: "#39FF14",
        barOpacity: 0.72,
      },
      playOrder: "countdown",
      transition: "flash",
      transitionDuration: 0.25,
      aspectMode: "blur-pad",
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

export function clipPlayDuration(clip: RankClip) {
  return Math.max(0.2, clip.trimEnd - clip.trimStart);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}
