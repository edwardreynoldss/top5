/**
 * Upload channels — control export folder + filename prefix,
 * and per-channel subscribe / bottom-sticker settings.
 * Counters + stickers live in localStorage (not by scanning exports/).
 */

import type { StickerOverlay } from "./types";
import { defaultSticker, normalizeSticker } from "./defaults";

export const CHANNELS_STORAGE_KEY = "rankshorts-channels-v1";

export interface ExportChannel {
  /** Display name, e.g. "Animals" */
  name: string;
  /** Folder / filename slug, e.g. "animals" */
  slug: string;
}

export interface ChannelExportState {
  channels: ExportChannel[];
  /** Selected channel slug for the next / current video */
  activeSlug: string;
  /**
   * Next video number to assign per channel (1-based).
   * Incremented when starting a NEW video (reset / first export of a set).
   */
  nextNumber: Record<string, number>;
  /** Subscribe / bottom sticker saved per channel slug */
  stickersBySlug: Record<string, StickerOverlay>;
}

/** Bound to the current clip set — cleared on Reset */
export interface ProjectExportSlot {
  channelSlug: string;
  /** Video number for this channel, e.g. 1 → ranking-animals-1 */
  number: number;
  /**
   * Export version within this clip set.
   * 1 = first export → ranking-animals-1
   * 2+ = re-export → ranking-animals-1.2
   */
  version: number;
}

/** Stable upload id for a channel's subscribe sticker (overwrites on re-upload). */
export function channelStickerMediaId(slug: string) {
  return `channel-${channelSlug(slug)}-sticker.webm`;
}

/**
 * Bundled defaults shipped in public/stickers/channels/{slug}.webm.
 * Used when a channel has no user-saved sticker yet and the file exists.
 */
export function bundledChannelSticker(slug: string): StickerOverlay | null {
  const safe = channelSlug(slug);
  // Only declare channels we ship a file for. Server probes confirm presence.
  if (safe === "animals") {
    return normalizeSticker({
      enabled: true,
      mediaId: channelStickerMediaId("animals"),
      mediaUrl: "/stickers/channels/animals.webm",
      fileName: "animals-subscribe.webm",
      scale: 0.55,
      speed: 1,
      startAt: 20,
      duration: 0,
      hasAlpha: true,
    });
  }
  return null;
}

export function channelSlug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "channel";
}

export function defaultChannelState(): ChannelExportState {
  return {
    channels: [
      { name: "Animals", slug: "animals" },
      { name: "Funny", slug: "funny" },
    ],
    activeSlug: "animals",
    nextNumber: { animals: 1, funny: 1 },
    stickersBySlug: {},
  };
}

function normalizeStickersBySlug(
  raw: unknown,
  channels: ExportChannel[]
): Record<string, StickerOverlay> {
  const out: Record<string, StickerOverlay> = {};
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Partial<StickerOverlay>>)
      : {};
  for (const c of channels) {
    if (src[c.slug]) {
      out[c.slug] = normalizeSticker(src[c.slug]);
    }
  }
  // Keep any extra saved slugs (channel removed but sticker retained)
  for (const [slug, sticker] of Object.entries(src)) {
    if (!out[slug] && sticker) out[slug] = normalizeSticker(sticker);
  }
  return out;
}

export function loadChannelState(): ChannelExportState {
  if (typeof window === "undefined") return defaultChannelState();
  try {
    const raw = localStorage.getItem(CHANNELS_STORAGE_KEY);
    if (!raw) return defaultChannelState();
    const parsed = JSON.parse(raw) as Partial<ChannelExportState>;
    const base = defaultChannelState();
    const channels =
      Array.isArray(parsed.channels) && parsed.channels.length > 0
        ? parsed.channels
            .map((c) => ({
              name: String(c.name || "").trim() || "Channel",
              slug: channelSlug(String(c.slug || c.name || "channel")),
            }))
            .filter((c, i, arr) => arr.findIndex((x) => x.slug === c.slug) === i)
        : base.channels;
    const nextNumber: Record<string, number> = { ...(parsed.nextNumber || {}) };
    for (const c of channels) {
      if (!Number.isFinite(nextNumber[c.slug]) || nextNumber[c.slug] < 1) {
        nextNumber[c.slug] = 1;
      }
    }
    const activeSlug =
      channels.some((c) => c.slug === parsed.activeSlug) && parsed.activeSlug
        ? parsed.activeSlug
        : channels[0].slug;
    const stickersBySlug = normalizeStickersBySlug(parsed.stickersBySlug, channels);
    return { channels, activeSlug, nextNumber, stickersBySlug };
  } catch {
    return defaultChannelState();
  }
}

export function saveChannelState(state: ChannelExportState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode
  }
}

export function stickerForChannel(state: ChannelExportState, slug: string): StickerOverlay {
  const safe = channelSlug(slug);
  const saved = state.stickersBySlug?.[safe];
  if (saved?.mediaId) return normalizeSticker(saved);
  const bundled = bundledChannelSticker(safe);
  return bundled || defaultSticker();
}

export function withChannelSticker(
  state: ChannelExportState,
  slug: string,
  sticker: StickerOverlay | Partial<StickerOverlay> | null | undefined
): ChannelExportState {
  const safe = channelSlug(slug);
  return {
    ...state,
    stickersBySlug: {
      ...state.stickersBySlug,
      [safe]: normalizeSticker(sticker),
    },
  };
}

/** ranking-animals-1 or ranking-animals-1.2 */
export function channelExportBaseName(slug: string, number: number, version: number) {
  const safe = channelSlug(slug);
  if (version <= 1) return `ranking-${safe}-${number}`;
  return `ranking-${safe}-${number}.${version}`;
}

export function channelExportFileName(slug: string, number: number, version: number) {
  return `${channelExportBaseName(slug, number, version)}.mp4`;
}

/**
 * Decide naming for this export.
 * - No slot / different channel → take nextNumber for channel, version 1, bump counter
 * - Same channel slot → keep number, bump version
 */
export function planChannelExport(
  state: ChannelExportState,
  slot: ProjectExportSlot | null | undefined
): {
  state: ChannelExportState;
  slot: ProjectExportSlot;
  fileName: string;
  relativeDir: string;
  relativePath: string;
} {
  const slug =
    state.channels.some((c) => c.slug === state.activeSlug)
      ? state.activeSlug
      : state.channels[0]?.slug || "animals";

  let nextState = {
    ...state,
    activeSlug: slug,
    nextNumber: { ...state.nextNumber },
    stickersBySlug: { ...state.stickersBySlug },
  };
  let nextSlot: ProjectExportSlot;

  if (slot && slot.channelSlug === slug && slot.number >= 1) {
    nextSlot = {
      channelSlug: slug,
      number: slot.number,
      version: Math.max(1, slot.version || 1) + 1,
    };
  } else {
    const n = Math.max(1, Math.floor(nextState.nextNumber[slug] || 1));
    nextSlot = { channelSlug: slug, number: n, version: 1 };
    nextState = {
      ...nextState,
      nextNumber: { ...nextState.nextNumber, [slug]: n + 1 },
    };
  }

  const fileName = channelExportFileName(nextSlot.channelSlug, nextSlot.number, nextSlot.version);
  const relativeDir = pathJoin("exports", nextSlot.channelSlug);
  return {
    state: nextState,
    slot: nextSlot,
    fileName,
    relativeDir,
    relativePath: pathJoin(relativeDir, fileName),
  };
}

function pathJoin(...parts: string[]) {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}
