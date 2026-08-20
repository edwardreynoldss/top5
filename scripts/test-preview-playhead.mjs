import assert from "node:assert/strict";

/** Mirrors PreviewPhone's display-clock updater (setLocalTime reducer). */
function nextLocalTime(prev, t) {
  if (!Number.isFinite(t)) return prev;
  return Math.abs(prev - t) >= 0.03 ? t : prev;
}

/** Mirrors the throttled publish of absTime to the editor store. */
function makePublisher() {
  let published = -1;
  return function publish(absTime, isPlaying) {
    const rounded = Number(absTime.toFixed(3));
    if (isPlaying && Math.abs(rounded - published) < 0.1) return null;
    if (rounded === published) return null;
    published = rounded;
    return rounded;
  };
}

// --- display clock keeps moving as the video advances ---
{
  let t = 0;
  // 60fps sampling of a video playing in real time
  const seen = [];
  for (let frame = 1; frame <= 60; frame++) {
    const videoTime = frame / 60;
    const next = nextLocalTime(t, videoTime);
    if (next !== t) seen.push(next);
    t = next;
  }
  // ~30Hz worth of updates over one second, never stalling
  assert.ok(seen.length >= 25 && seen.length <= 35, `updates=${seen.length}`);
  assert.ok(Math.abs(t - 1) < 0.05, `final=${t}`);
}

// --- tiny jitter does not churn state ---
{
  const t = 5;
  assert.equal(nextLocalTime(t, 5.001), 5, "sub-threshold sample is ignored");
  assert.equal(nextLocalTime(t, 5.05), 5.05, "real movement is applied");
}

// --- a backwards seek is followed immediately ---
{
  assert.equal(nextLocalTime(9, 2), 2);
}

// --- NaN/absent currentTime cannot clear the clock ---
{
  assert.equal(nextLocalTime(3.2, NaN), 3.2);
}

// --- store publishing is throttled while playing ---
{
  const publish = makePublisher();
  assert.equal(publish(0, true), 0);
  assert.equal(publish(0.02, true), null, "throttled while playing");
  assert.equal(publish(0.05, true), null);
  assert.equal(publish(0.12, true), 0.12, "publishes past the 0.1s step");
}

// --- paused publishes exactly (used by "add at playhead") ---
{
  const publish = makePublisher();
  assert.equal(publish(4, false), 4);
  assert.equal(publish(4.02, false), 4.02, "exact while paused");
  assert.equal(publish(4.02, false), null, "no duplicate publish");
}

console.log("preview playhead tests passed");
