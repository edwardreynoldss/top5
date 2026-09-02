import assert from "node:assert/strict";

function clampMusicStartAt(n, fallback = 0) {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function lookMusicLoopInputArgs(startAt, alreadyTrimmed = false) {
  const ss = clampMusicStartAt(startAt);
  if (!alreadyTrimmed && ss > 0.01) {
    return ["-ss", ss.toFixed(3), "-stream_loop", "-1"];
  }
  return ["-stream_loop", "-1"];
}

function parseMusicStartPrefs(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    out[key] = clampMusicStartAt(value, 0);
  }
  return out;
}

function getMusicStartFromPrefs(prefs, mediaId) {
  if (!mediaId) return 0;
  return clampMusicStartAt(prefs[mediaId], 0);
}

function withMusicStartPref(prefs, mediaId, startAt) {
  if (!mediaId) return prefs;
  return { ...prefs, [mediaId]: clampMusicStartAt(startAt) };
}

function rememberThenSelect(current, item, prefs) {
  const nextPrefs =
    current.musicMediaId && current.musicMediaId !== item.mediaId
      ? withMusicStartPref(prefs, current.musicMediaId, current.musicStartAt ?? 0)
      : prefs;
  const startAt =
    current.musicMediaId === item.mediaId
      ? current.musicStartAt ?? 0
      : getMusicStartFromPrefs(nextPrefs, item.mediaId);
  return {
    prefs: nextPrefs,
    settings: {
      musicMediaId: item.mediaId,
      musicUrl: item.mediaUrl,
      musicStartAt: startAt,
    },
  };
}

assert.equal(clampMusicStartAt(-3), 0);
assert.equal(clampMusicStartAt(12.5), 12.5);
assert.equal(clampMusicStartAt("nope", 0), 0);
assert.equal(clampMusicStartAt(undefined, 4), 4);

assert.deepEqual(lookMusicLoopInputArgs(0), ["-stream_loop", "-1"]);
assert.deepEqual(lookMusicLoopInputArgs(12.5), ["-ss", "12.500", "-stream_loop", "-1"]);
assert.deepEqual(lookMusicLoopInputArgs(12.5, true), ["-stream_loop", "-1"]);

let prefs = parseMusicStartPrefs({
  "music__intro.mp3": 18.2,
  "music__bad.mp3": -9,
  "": 4,
});
assert.equal(prefs["music__intro.mp3"], 18.2);
assert.equal(prefs["music__bad.mp3"], 0);
assert.equal(Object.prototype.hasOwnProperty.call(prefs, ""), false);

prefs = withMusicStartPref(prefs, "music__intro.mp3", 22);
assert.equal(getMusicStartFromPrefs(prefs, "music__intro.mp3"), 22);
assert.equal(getMusicStartFromPrefs(prefs, "music__other.wav"), 0);

const picked = rememberThenSelect(
  { musicMediaId: "music__other.wav", musicStartAt: 4 },
  { mediaId: "music__intro.mp3", mediaUrl: "/api/music/file/intro.mp3" },
  prefs
);
assert.equal(picked.settings.musicStartAt, 22);
assert.equal(picked.prefs["music__other.wav"], 4);

const sameSong = rememberThenSelect(
  { musicMediaId: "music__intro.mp3", musicStartAt: 9 },
  { mediaId: "music__intro.mp3", mediaUrl: "/api/music/file/intro.mp3" },
  picked.prefs
);
assert.equal(sameSong.settings.musicStartAt, 9);

const fresh = rememberThenSelect(
  { musicMediaId: "music__intro.mp3", musicStartAt: 22 },
  { mediaId: "music__new.mp3", mediaUrl: "/api/music/file/new.mp3" },
  picked.prefs
);
assert.equal(fresh.settings.musicStartAt, 0);
assert.equal(fresh.prefs["music__intro.mp3"], 22);

console.log("look music start offset tests passed");
