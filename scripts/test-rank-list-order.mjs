/**
 * The rank numbers on screen keep their own top-to-bottom order; playback order
 * only decides when a label appears next to a number.
 */
import assert from "node:assert/strict";

/** Mirrors rankListDirection in src/lib/defaults.ts */
function rankListDirection(input) {
  const mode =
    typeof input === "string" ? input : input.rankListOrder ?? "auto";
  if (mode === "descending" || mode === "ascending") return mode;
  const playOrder = typeof input === "string" ? null : input.playOrder;
  return playOrder === "ascending" ? "ascending" : "descending";
}

/** Mirrors sortClipsForRankList in src/lib/defaults.ts */
function sortClipsForRankList(clips, input) {
  const dir = rankListDirection(input);
  return [...clips].sort((a, b) =>
    dir === "descending" ? b.rank - a.rank : a.rank - b.rank
  );
}

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

const clips = [1, 2, 3, 4, 5].map((rank) => ({
  id: `c${rank}`,
  rank,
  label: `name${rank}`,
  status: "ready",
}));
const ranksOf = (list) => list.map((c) => c.rank);

// --- auto keeps the familiar look for the fixed play orders ---
assert.deepEqual(
  ranksOf(sortClipsForRankList(clips, { playOrder: "countdown" })),
  [5, 4, 3, 2, 1]
);
assert.deepEqual(
  ranksOf(sortClipsForRankList(clips, { playOrder: "ascending" })),
  [1, 2, 3, 4, 5]
);

// --- a custom sequence must not move the numbers on screen ---
{
  const settings = {
    playOrder: "custom",
    customOrder: ["c4", "c2", "c1", "c5", "c3"],
  };
  assert.deepEqual(
    ranksOf(sortClipsForPlayback(clips, settings)),
    [4, 2, 1, 5, 3],
    "clips still play in the custom sequence"
  );
  assert.deepEqual(
    ranksOf(sortClipsForRankList(clips, settings)),
    [5, 4, 3, 2, 1],
    "5 stays on top, 1 stays at the bottom"
  );
}

// --- explicit choices win over the play order ---
assert.deepEqual(
  ranksOf(
    sortClipsForRankList(clips, {
      playOrder: "ascending",
      rankListOrder: "descending",
    })
  ),
  [5, 4, 3, 2, 1]
);
assert.deepEqual(
  ranksOf(
    sortClipsForRankList(clips, {
      playOrder: "countdown",
      rankListOrder: "ascending",
    })
  ),
  [1, 2, 3, 4, 5]
);

// --- unknown/legacy values fall back to auto ---
assert.equal(
  rankListDirection({ playOrder: "custom", rankListOrder: undefined }),
  "descending"
);
assert.equal(
  rankListDirection({ playOrder: "ascending", rankListOrder: "nonsense" }),
  "ascending"
);

/**
 * Preview reveal: a row shows its label once that clip's turn has come, based on
 * its position in the play sequence rather than its row on screen.
 */
function previewRows(clips, settings, activeIndex) {
  const sequence = sortClipsForPlayback(clips, settings).filter(
    (c) => c.status === "ready"
  );
  return sortClipsForRankList(clips, settings).map((c) => {
    const seqIdx = sequence.findIndex((x) => x.id === c.id);
    const revealed = seqIdx >= 0 && seqIdx <= activeIndex;
    return { rank: c.rank, label: revealed ? c.label : "" };
  });
}

{
  const settings = {
    playOrder: "custom",
    customOrder: ["c4", "c2", "c1", "c5", "c3"],
  };
  // First clip played is rank 4 — its name lands on the "4." row, third down.
  assert.deepEqual(previewRows(clips, settings, 0), [
    { rank: 5, label: "" },
    { rank: 4, label: "name4" },
    { rank: 3, label: "" },
    { rank: 2, label: "" },
    { rank: 1, label: "" },
  ]);
  // Second is rank 2, so 4 and 2 read while 5, 3, 1 stay blank.
  assert.deepEqual(previewRows(clips, settings, 1), [
    { rank: 5, label: "" },
    { rank: 4, label: "name4" },
    { rank: 3, label: "" },
    { rank: 2, label: "name2" },
    { rank: 1, label: "" },
  ]);
  // Last clip played is rank 3 — every row reads by then.
  assert.deepEqual(
    previewRows(clips, settings, 4).map((r) => r.label),
    ["name5", "name4", "name3", "name2", "name1"]
  );
}

/** Mirrors the export route: rows in screen order, labels by playback index. */
function exportRows(clips, playbackRanks, screenRanks, i) {
  const rankPosition = new Map(playbackRanks.map((rank, idx) => [rank, idx]));
  const ordered = [...clips].sort(
    (a, b) => rankPosition.get(a.rank) - rankPosition.get(b.rank)
  );
  const screenPosition = new Map(screenRanks.map((rank, idx) => [rank, idx]));
  const displayed = [...ordered].sort(
    (a, b) => screenPosition.get(a.rank) - screenPosition.get(b.rank)
  );
  const playIndexByRank = new Map(ordered.map((c, idx) => [c.rank, idx]));
  return displayed.map((c) => {
    const idx = playIndexByRank.get(c.rank);
    return { rank: c.rank, label: idx == null || idx > i ? "" : c.label };
  });
}

{
  const playbackRanks = [4, 2, 1, 5, 3];
  const screenRanks = [5, 4, 3, 2, 1];
  for (let i = 0; i < playbackRanks.length; i++) {
    assert.deepEqual(
      exportRows(clips, playbackRanks, screenRanks, i).map((r) => r.rank),
      screenRanks,
      "export rows never reshuffle"
    );
    assert.deepEqual(
      exportRows(clips, playbackRanks, screenRanks, i),
      previewRows(
        clips,
        { playOrder: "custom", customOrder: ["c4", "c2", "c1", "c5", "c3"] },
        i
      ),
      "export matches the preview reveal"
    );
  }
}

console.log("rank list order tests passed");
