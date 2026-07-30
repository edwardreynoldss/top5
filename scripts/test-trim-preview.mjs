import assert from "node:assert/strict";

function shouldIgnoreTimeUpdate(opts) {
  if (opts.seeking) return true;
  if (!opts.playing) return true;
  if (!opts.seg) return true;
  return false;
}

function nextPlaybackAction(opts) {
  const { currentTime, seg, previewAll, segIndex, segCount } = opts;
  if (currentTime < seg.start - 0.02) return "continue";
  if (currentTime < seg.end - 0.04) return "continue";
  if (previewAll && segIndex < segCount - 1) return "advance";
  return "stop";
}

function playheadAfterStartChange(opts) {
  return {
    seekTo: opts.newStart,
    keepPlaying: opts.wasPlaying,
  };
}

// After scrubbing start, seek guard must clear so preview can run
{
  let seeking = true;
  seeking = false; // TrimModal beginSeek timeout
  assert.equal(
    shouldIgnoreTimeUpdate({
      seeking,
      playing: true,
      currentTime: 2,
      seg: { start: 2, end: 5 },
    }),
    false
  );
}

// Changing start seeks playhead to the new in-point and keeps playing
{
  const action = playheadAfterStartChange({
    newStart: 3.5,
    currentTime: 1,
    wasPlaying: true,
  });
  assert.equal(action.seekTo, 3.5);
  assert.equal(action.keepPlaying, true);
}

assert.equal(
  nextPlaybackAction({
    currentTime: 4.98,
    seg: { start: 2, end: 5 },
    previewAll: false,
    segIndex: 0,
    segCount: 1,
  }),
  "stop"
);

assert.equal(
  nextPlaybackAction({
    currentTime: 3.0,
    seg: { start: 1, end: 3 },
    previewAll: true,
    segIndex: 0,
    segCount: 2,
  }),
  "advance"
);

assert.equal(
  nextPlaybackAction({
    currentTime: 2.5,
    seg: { start: 2, end: 5 },
    previewAll: false,
    segIndex: 0,
    segCount: 1,
  }),
  "continue"
);

assert.equal(
  shouldIgnoreTimeUpdate({
    seeking: true,
    playing: true,
    currentTime: 2,
    seg: { start: 2, end: 5 },
  }),
  true
);

console.log("trimPreview tests passed");
