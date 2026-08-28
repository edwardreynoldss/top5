import assert from "node:assert/strict";

function clampRank(rank) {
  const n = Math.round(Number(rank));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

function assignClipRank(clips, clipId, rank) {
  const nextRank = clampRank(rank);
  const target = clips.find((c) => c.id === clipId);
  if (!target || target.rank === nextRank) return clips;
  const occupant = clips.find((c) => c.rank === nextRank);
  return clips.map((c) => {
    if (c.id === clipId) return { ...c, rank: nextRank };
    if (occupant && c.id === occupant.id) return { ...c, rank: target.rank };
    return c;
  });
}

const clips = [5, 4, 3, 2, 1].map((rank) => ({
  id: `c${rank}`,
  rank,
  label: `v${rank}`,
}));
const ranksOf = (list) => list.map((c) => `${c.id}:${c.rank}`);

// Same rank is a no-op (same array)
{
  const next = assignClipRank(clips, "c5", 5);
  assert.equal(next, clips);
}

// Change 5 → 3 swaps with the clip that was 3
{
  const next = assignClipRank(clips, "c5", 3);
  assert.equal(next.find((c) => c.id === "c5").rank, 3);
  assert.equal(next.find((c) => c.id === "c3").rank, 5);
  assert.equal(next.find((c) => c.id === "c4").rank, 4);
  assert.deepEqual(
    next.map((c) => c.id),
    clips.map((c) => c.id),
    "clip slots / play identity stay put"
  );
}

// Ready video can change number without being cleared
{
  const ready = clips.map((c) => ({ ...c, status: c.id === "c2" ? "ready" : "empty" }));
  const next = assignClipRank(ready, "c2", 5);
  assert.equal(next.find((c) => c.id === "c2").rank, 5);
  assert.equal(next.find((c) => c.id === "c2").status, "ready");
  assert.equal(next.find((c) => c.id === "c5").rank, 2);
}

// Out of range clamps
{
  const next = assignClipRank(clips, "c1", 99);
  assert.equal(next.find((c) => c.id === "c1").rank, 5);
  assert.equal(next.find((c) => c.id === "c5").rank, 1);
}

assert.deepEqual(ranksOf(clips), ["c5:5", "c4:4", "c3:3", "c2:2", "c1:1"], "source unmutated");

console.log("clip rank assign tests passed");
