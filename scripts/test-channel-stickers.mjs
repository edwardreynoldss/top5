import assert from "node:assert/strict";

function channelSlug(name) {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "channel";
}

function channelStickerMediaId(slug) {
  return `channel-${channelSlug(slug)}-sticker.webm`;
}

function defaultSticker() {
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

function normalizeSticker(sticker) {
  const d = defaultSticker();
  const mediaId = sticker?.mediaId ?? d.mediaId;
  const wantsEnabled =
    typeof sticker?.enabled === "boolean" ? sticker.enabled : Boolean(mediaId);
  return {
    enabled: Boolean(wantsEnabled && mediaId),
    mediaId,
    mediaUrl: sticker?.mediaUrl ?? (mediaId ? `/api/media/${mediaId}` : d.mediaUrl),
    fileName: sticker?.fileName ?? d.fileName,
    scale: Math.max(0.15, Math.min(1.5, sticker?.scale ?? d.scale)),
    speed: Math.max(0.25, Math.min(3, sticker?.speed ?? d.speed)),
    startAt: Math.max(0, sticker?.startAt ?? d.startAt),
    duration: Math.max(0, sticker?.duration ?? d.duration),
    hasAlpha: Boolean(sticker?.hasAlpha),
  };
}

function withChannelSticker(state, slug, sticker) {
  const safe = channelSlug(slug);
  return {
    ...state,
    stickersBySlug: {
      ...state.stickersBySlug,
      [safe]: normalizeSticker(sticker),
    },
  };
}

function stickerForChannel(state, slug) {
  const safe = channelSlug(slug);
  const saved = state.stickersBySlug?.[safe];
  if (saved?.mediaId) return normalizeSticker(saved);
  return defaultSticker();
}

assert.equal(channelStickerMediaId("Animals"), "channel-animals-sticker.webm");

let state = {
  channels: [
    { name: "Animals", slug: "animals" },
    { name: "Funny", slug: "funny" },
  ],
  activeSlug: "animals",
  nextNumber: { animals: 1, funny: 1 },
  stickersBySlug: {},
};

const animalsSticker = normalizeSticker({
  enabled: true,
  mediaId: channelStickerMediaId("animals"),
  mediaUrl: "/api/media/channel-animals-sticker.webm",
  fileName: "animals.webm",
  hasAlpha: true,
  duration: 4,
});

state = withChannelSticker(state, "animals", animalsSticker);
assert.equal(stickerForChannel(state, "animals").mediaId, "channel-animals-sticker.webm");
assert.equal(stickerForChannel(state, "funny").mediaId, null);

// Switch: keep animals, funny stays empty
const funny = normalizeSticker({
  enabled: true,
  mediaId: channelStickerMediaId("funny"),
  fileName: "funny.webm",
});
state = withChannelSticker(state, "funny", funny);
assert.equal(stickerForChannel(state, "animals").fileName, "animals.webm");
assert.equal(stickerForChannel(state, "funny").fileName, "funny.webm");

console.log("channel sticker tests passed");
