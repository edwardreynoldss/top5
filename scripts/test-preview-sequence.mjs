import assert from "node:assert/strict";

/**
 * Mirrors PreviewPhone advance rules: after each clip's last segment ends,
 * move to the next ready clip until the ranking is done.
 */
function nextClipIndex(activeIndex, sequenceLength) {
  const next = activeIndex + 1;
  if (next < sequenceLength) return { index: next, playing: true };
  return { index: 0, playing: false };
}

const seq = ["a", "b", "c"];
let idx = 0;
let playing = true;
const visited = [idx];

while (playing) {
  const step = nextClipIndex(idx, seq.length);
  idx = step.index;
  playing = step.playing;
  if (playing) visited.push(idx);
}

assert.deepEqual(visited, [0, 1, 2]);
assert.equal(playing, false);
assert.equal(idx, 0);

// AbortError must not stop playback (guard contract)
function shouldStopOnPlayError(name) {
  return name !== "AbortError";
}
assert.equal(shouldStopOnPlayError("AbortError"), false);
assert.equal(shouldStopOnPlayError("NotAllowedError"), true);

console.log("preview sequence tests passed");
