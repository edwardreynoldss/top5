import assert from "node:assert/strict";

const TRANSITION_VOLUME_UI_SCALE = 0.2;

const clampVol = (n, fallback = 1) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : fallback;

function effectiveTransitionVolume(settingsVolume, clipVolume) {
  return Math.max(
    0,
    Math.min(3, clampVol(settingsVolume) * clampVol(clipVolume) * TRANSITION_VOLUME_UI_SCALE)
  );
}

/** Mirrors clipTimelineOffsets for ready clips in playback order. */
function offsetsFor(order) {
  let t = 0;
  return order.map((c, i) => {
    const row = {
      clipId: c.id,
      start: t,
      duration: c.duration,
      gapAfter: i < order.length - 1 ? c.gapAfter || 0 : 0,
    };
    t += row.duration + row.gapAfter;
    return row;
  });
}

/** Mirrors transitionSoundHits in src/lib/defaults.ts */
function transitionSoundHits(order, sound) {
  if (!sound.enabled || !sound.mediaId) return [];
  const offsets = offsetsFor(order);
  const hits = [];
  for (let i = 0; i < order.length - 1; i++) {
    const clip = order[i];
    const row = offsets[i];
    const volume = effectiveTransitionVolume(sound.volume, clip.transitionVolume);
    if (volume <= 0.0005) continue;
    hits.push({
      clipId: clip.id,
      startAt: Math.max(0, row.start + row.duration - sound.lead),
      volume,
    });
  }
  return hits;
}

const sound = { enabled: true, mediaId: "builtin", volume: 1, lead: 0.25 };
const order = [
  { id: "a", duration: 4, gapAfter: 0 },
  { id: "b", duration: 5, gapAfter: 0 },
  { id: "c", duration: 3, gapAfter: 0 },
];

// --- one whoosh per handoff; the final clip has none ---
{
  const hits = transitionSoundHits(order, sound);
  assert.equal(hits.length, 2, "3 clips = 2 handoffs");
  assert.deepEqual(
    hits.map((h) => h.clipId),
    ["a", "b"],
    "the last clip never fires one"
  );
}

// --- it lands on the cut, started early by the lead ---
{
  const hits = transitionSoundHits(order, sound);
  // a ends at 4, b ends at 9
  assert.ok(Math.abs(hits[0].startAt - 3.75) < 1e-9, `got ${hits[0].startAt}`);
  assert.ok(Math.abs(hits[1].startAt - 8.75) < 1e-9, `got ${hits[1].startAt}`);
}

// --- a black hold after a clip doesn't push the whoosh late ---
{
  const withGap = [
    { id: "a", duration: 4, gapAfter: 2 },
    { id: "b", duration: 5, gapAfter: 0 },
  ];
  const hits = transitionSoundHits(withGap, sound);
  assert.equal(hits.length, 1);
  assert.ok(
    Math.abs(hits[0].startAt - 3.75) < 1e-9,
    "fires at the cut, not after the black hold"
  );
}

// --- lead never pulls the sound before the timeline starts ---
{
  const hits = transitionSoundHits(
    [{ id: "a", duration: 0.1, gapAfter: 0 }, { id: "b", duration: 3, gapAfter: 0 }],
    { ...sound, lead: 1 }
  );
  assert.equal(hits[0].startAt, 0);
}

// --- quiet by default: 100% sliders give 20% real gain ---
{
  assert.ok(Math.abs(effectiveTransitionVolume(1, 1) - 0.2) < 1e-9);
}

// --- per-clip volume scales only that clip's handoff ---
{
  const mixed = [
    { id: "a", duration: 4, gapAfter: 0, transitionVolume: 0.5 },
    { id: "b", duration: 5, gapAfter: 0, transitionVolume: 2 },
    { id: "c", duration: 3, gapAfter: 0 },
  ];
  const hits = transitionSoundHits(mixed, sound);
  assert.ok(Math.abs(hits[0].volume - 0.1) < 1e-9, `got ${hits[0].volume}`);
  assert.ok(Math.abs(hits[1].volume - 0.4) < 1e-9, `got ${hits[1].volume}`);
}

// --- a clip set to 0% is skipped entirely, others keep firing ---
{
  const muted = [
    { id: "a", duration: 4, gapAfter: 0, transitionVolume: 0 },
    { id: "b", duration: 5, gapAfter: 0 },
    { id: "c", duration: 3, gapAfter: 0 },
  ];
  const hits = transitionSoundHits(muted, sound);
  assert.deepEqual(hits.map((h) => h.clipId), ["b"]);
}

// --- project master volume scales every handoff ---
{
  const hits = transitionSoundHits(order, { ...sound, volume: 0.5 });
  for (const h of hits) assert.ok(Math.abs(h.volume - 0.1) < 1e-9);
}

// --- turning it off produces nothing ---
{
  assert.deepEqual(transitionSoundHits(order, { ...sound, enabled: false }), []);
}

// --- a single clip has no handoff at all ---
{
  assert.deepEqual(transitionSoundHits([{ id: "solo", duration: 4 }], sound), []);
}

console.log("transition sound tests passed");
