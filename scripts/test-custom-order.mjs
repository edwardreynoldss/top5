import assert from "node:assert/strict";

/** Mirrors sortClipsForPlayback in src/lib/defaults.ts */
function sortClipsForPlayback(clips, input) {
  const { playOrder, customOrder } =
    typeof input === "string"
      ? { playOrder: input, customOrder: [] }
      : { playOrder: input.playOrder, customOrder: input.customOrder || [] };
  if (playOrder === "custom") {
    const position = new Map(customOrder.map((id, i) => [id, i]));
    return [...clips].sort((a, b) => {
      const ai = position.get(a.id);
      const bi = position.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return b.rank - a.rank;
    });
  }
  return [...clips].sort((a, b) =>
    playOrder === "countdown" ? b.rank - a.rank : a.rank - b.rank
  );
}

function shuffleOrderIds(ids, rand = Math.random) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function moveIdInOrder(ids, activeId, overId) {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return ids;
  const next = [...ids];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

const clips = [1, 2, 3, 4, 5].map((rank) => ({
  id: `c${rank}`,
  rank,
  status: "ready",
}));
const ranksOf = (list) => list.map((c) => c.rank);

// --- existing modes are unchanged ---
assert.deepEqual(ranksOf(sortClipsForPlayback(clips, "countdown")), [5, 4, 3, 2, 1]);
assert.deepEqual(ranksOf(sortClipsForPlayback(clips, "ascending")), [1, 2, 3, 4, 5]);

// --- the requested 4 > 2 > 1 > 5 > 3 sequence ---
{
  const settings = {
    playOrder: "custom",
    customOrder: ["c4", "c2", "c1", "c5", "c3"],
  };
  assert.deepEqual(ranksOf(sortClipsForPlayback(clips, settings)), [4, 2, 1, 5, 3]);
}

// --- dragging the right-side list updates play order, not rank numbers ---
{
  const settings = {
    playOrder: "custom",
    customOrder: ["c3", "c5", "c2", "c1", "c4"],
  };
  assert.deepEqual(ranksOf(sortClipsForPlayback(clips, settings)), [3, 5, 2, 1, 4]);

  // Drag rank 5 in front of rank 3
  const ids = moveIdInOrder(settings.customOrder, "c5", "c3");
  const after = { playOrder: "custom", customOrder: ids };
  assert.deepEqual(ranksOf(sortClipsForPlayback(clips, after)), [5, 3, 2, 1, 4]);
  assert.equal(
    clips.find((c) => c.id === "c3").rank,
    3,
    "rank numbers stay on their clip"
  );
  assert.equal(clips.find((c) => c.id === "c5").rank, 5);

  // Drag rank 4 from last to second
  const ids2 = moveIdInOrder(ids, "c4", "c3");
  assert.deepEqual(
    ranksOf(sortClipsForPlayback(clips, { playOrder: "custom", customOrder: ids2 })),
    [5, 4, 3, 2, 1]
  );
}

// --- countdown list drag becomes a custom sequence (5 stays #5, moves in line) ---
{
  const countdownIds = sortClipsForPlayback(clips, "countdown").map((c) => c.id);
  assert.deepEqual(
    ranksOf(sortClipsForPlayback(clips, { playOrder: "custom", customOrder: countdownIds })),
    [5, 4, 3, 2, 1]
  );
  const dragged = moveIdInOrder(countdownIds, "c3", "c5");
  assert.deepEqual(
    ranksOf(sortClipsForPlayback(clips, { playOrder: "custom", customOrder: dragged })),
    [3, 5, 4, 2, 1]
  );
}
{
  const settings = { playOrder: "custom", customOrder: ["c3", "c1"] };
  const out = sortClipsForPlayback(clips, settings);
  assert.equal(out[0].id, "c3");
  assert.equal(out[0].rank, 3, "clip keeps its rank when played first");
}

// --- clips missing from the sequence fall in behind, countdown order ---
{
  const settings = { playOrder: "custom", customOrder: ["c2"] };
  assert.deepEqual(ranksOf(sortClipsForPlayback(clips, settings)), [2, 5, 4, 3, 1]);
}

// --- an empty custom list degrades to countdown rather than breaking ---
{
  const settings = { playOrder: "custom", customOrder: [] };
  assert.deepEqual(ranksOf(sortClipsForPlayback(clips, settings)), [5, 4, 3, 2, 1]);
}

// --- shuffle keeps every clip exactly once ---
{
  const ids = clips.map((c) => c.id);
  for (let trial = 0; trial < 50; trial++) {
    const out = shuffleOrderIds(ids);
    assert.equal(out.length, ids.length);
    assert.deepEqual([...out].sort(), [...ids].sort(), "no clip lost or duplicated");
  }
}

// --- repeated shuffles do produce different orders ---
{
  const ids = clips.map((c) => c.id);
  const seen = new Set();
  for (let trial = 0; trial < 60; trial++) seen.add(shuffleOrderIds(ids).join(","));
  assert.ok(seen.size > 1, "randomize must be able to change the order");
}

// --- export re-sorts by the explicit playback ranks it was sent ---
{
  const playbackRanks = [4, 2, 1, 5, 3];
  const rankPosition = new Map(playbackRanks.map((rank, i) => [rank, i]));
  const ordered = [...clips].sort((a, b) => {
    const ai = rankPosition.get(a.rank);
    const bi = rankPosition.get(b.rank);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return b.rank - a.rank;
  });
  assert.deepEqual(ranksOf(ordered), playbackRanks, "export matches preview order");
}

console.log("custom play order tests passed");
