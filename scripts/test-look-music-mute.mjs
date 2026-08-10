import assert from "node:assert/strict";

function clipMutesLookMusic(clip) {
  return clip?.muteLookMusic === true;
}

function clipPlayDuration(clip) {
  return Math.max(0.2, clip._playDur ?? 4);
}

function getClipGapAfter(clip) {
  return Math.max(0, clip.gapAfter || 0);
}

function getPlaybackOrder(clips, playOrder) {
  const sorted = [...clips].sort((a, b) =>
    playOrder === "countdown" ? b.rank - a.rank : a.rank - b.rank
  );
  return sorted.filter((c) => c.status === "ready");
}

function clipTimelineOffsets(clips, playOrder) {
  const order = getPlaybackOrder(clips, playOrder);
  let t = 0;
  return order.map((c, i) => {
    const duration = clipPlayDuration(c);
    const gapAfter = i < order.length - 1 ? getClipGapAfter(c) : 0;
    const row = { clipId: c.id, start: t, duration, gapAfter };
    t += duration + gapAfter;
    return row;
  });
}

function lookMusicMuteWindows(clips, playOrder) {
  const offsets = clipTimelineOffsets(clips, playOrder);
  const out = [];
  for (const row of offsets) {
    const clip = clips.find((c) => c.id === row.clipId);
    if (!clip || !clipMutesLookMusic(clip)) continue;
    const start = Math.max(0, row.start);
    const end = Math.max(start + 0.05, start + row.duration);
    out.push({ start, end });
  }
  return out;
}

function lookMusicMuteEnableExpr(windows) {
  const parts = windows
    .filter((w) => w.end > w.start + 0.02)
    .map((w) => `between(t\\,${w.start.toFixed(3)}\\,${w.end.toFixed(3)})`);
  if (parts.length === 0) return null;
  return parts.join("+");
}

const clips = [
  { id: "a", rank: 5, status: "ready", _playDur: 4, gapAfter: 1, muteLookMusic: false },
  { id: "b", rank: 4, status: "ready", _playDur: 5, gapAfter: 0, muteLookMusic: true },
  { id: "c", rank: 3, status: "ready", _playDur: 3, gapAfter: 0, muteLookMusic: false },
];

// countdown: 5 → 4 → 3
const windows = lookMusicMuteWindows(clips, "countdown");
assert.equal(windows.length, 1);
// clip a: 0–4 (+1 gap) → clip b starts at 5, lasts 5 → mute 5–10
assert.ok(Math.abs(windows[0].start - 5) < 1e-9, `start=${windows[0].start}`);
assert.ok(Math.abs(windows[0].end - 10) < 1e-9, `end=${windows[0].end}`);

const expr = lookMusicMuteEnableExpr(windows);
assert.ok(expr && expr.includes("between(t\\,5.000\\,10.000)"), expr);

// No mute → null expr
assert.equal(lookMusicMuteEnableExpr([]), null);
assert.equal(lookMusicMuteWindows(clips.map((c) => ({ ...c, muteLookMusic: false })), "countdown").length, 0);

// Gap after muted clip is NOT included in mute window (music resumes in gap)
const withGap = [
  { id: "m", rank: 1, status: "ready", _playDur: 4, gapAfter: 2, muteLookMusic: true },
  { id: "n", rank: 2, status: "ready", _playDur: 3, gapAfter: 0, muteLookMusic: false },
];
const w2 = lookMusicMuteWindows(withGap, "ascending");
assert.equal(w2.length, 1);
assert.ok(Math.abs(w2[0].start - 0) < 1e-9);
assert.ok(Math.abs(w2[0].end - 4) < 1e-9, "must not include 2s gap after");

console.log("look music mute window tests passed");
