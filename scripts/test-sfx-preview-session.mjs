import assert from "node:assert/strict";

function sfxTrimDuration(trimStart, trimEnd) {
  const ts = Math.max(0, trimStart ?? 0);
  const te = Math.max(ts + 0.05, trimEnd ?? ts + 1);
  return te - ts;
}

function sfxWindowEnd(start, trimStart, trimEnd) {
  return start + sfxTrimDuration(trimStart, trimEnd);
}

function sfxShouldCatchup(absNow, start, trimStart, trimEnd) {
  const end = sfxWindowEnd(start, trimStart, trimEnd);
  return !(absNow < start - 0.03 || absNow >= end - 0.02);
}

function sfxCrossedStart(prevAbs, absNow, start, trimStart, trimEnd) {
  const end = sfxWindowEnd(start, trimStart, trimEnd);
  if (absNow >= end - 0.02) return false;
  return prevAbs < start && start <= absNow;
}

function sfxPreviewSourceTime(absNow, start, trimStart, trimEnd, catchup) {
  const ts = Math.max(0, trimStart);
  const te = Math.max(ts + 0.05, trimEnd);
  const into = catchup ? Math.max(0, absNow - start) : 0;
  return Math.min(ts + into, te - 0.02);
}

/** Mirrors PreviewPhone play-session: arm once, live-cross, no re-arm on clip change. */
function createPreviewSession(placements) {
  const fired = new Set();
  const plays = [];
  let armed = false;
  let lastScan = 0;

  function tryPlay(p, absNow, mode) {
    if (fired.has(p.id)) return;
    const start = p.startAt;
    const trimStart = p.trimStart;
    const trimEnd = p.trimEnd;
    if (mode === "catchup") {
      if (!sfxShouldCatchup(absNow, start, trimStart, trimEnd)) return;
    } else if (!sfxCrossedStart(lastScan, absNow, start, trimStart, trimEnd)) {
      return;
    }
    fired.add(p.id);
    plays.push({
      id: p.id,
      at: absNow,
      mode,
      from: sfxPreviewSourceTime(absNow, start, trimStart, trimEnd, mode === "catchup"),
    });
  }

  return {
    plays,
    fired,
    play(absNow) {
      if (armed) return;
      armed = true;
      lastScan = absNow;
      for (const p of placements) tryPlay(p, absNow, "catchup");
    },
    pause() {
      armed = false;
      fired.clear();
    },
    /** Clip/mediaReady cycle while already playing — must not re-arm. */
    clipReady(absNow) {
      if (!armed) {
        this.play(absNow);
        return;
      }
    },
    tick(absNow, { advancing = false, mediaReady = true } = {}) {
      if (!armed || advancing || !mediaReady) return;
      for (const p of placements) tryPlay(p, absNow, "live");
      lastScan = absNow;
    },
  };
}

const longHit = { id: "boom", startAt: 1, trimStart: 0, trimEnd: 8 };
const laterHit = { id: "clap", startAt: 6, trimStart: 0.2, trimEnd: 1.2 };
const zeroHit = { id: "zero", startAt: 0, trimStart: 0.5, trimEnd: 2 };

// Play from 0: fire the 0s hit from trimStart, then each later hit once on the crossing
{
  const s = createPreviewSession([zeroHit, longHit, laterHit]);
  s.play(0);
  assert.deepEqual(
    s.plays.map((p) => [p.id, p.mode, p.from]),
    [["zero", "catchup", 0.5]],
    "t=0 catchup plays the 0s hit from trimStart"
  );
  s.tick(0.5);
  s.tick(0.98);
  s.tick(1.02);
  assert.equal(s.plays.filter((p) => p.id === "boom").length, 1);
  assert.equal(s.plays.find((p) => p.id === "boom").from, 0, "live hit plays the attack");
  s.tick(5.0);
  s.clipReady(5.0); // next clip loaded — old bug re-fired boom mid-sample
  s.tick(5.2);
  assert.equal(s.plays.filter((p) => p.id === "boom").length, 1, "clip change must not re-fire");
  s.tick(5.98);
  s.tick(6.04);
  assert.equal(s.plays.filter((p) => p.id === "clap").length, 1);
  assert.equal(s.plays.find((p) => p.id === "clap").from, 0.2);
  assert.equal(s.plays.length, 3);
}

// Old reset-on-clip-change path would catchup-fire the long hit again at t=5
{
  assert.equal(sfxShouldCatchup(5, 1, 0, 8), true, "still inside sample at clip 2");
  assert.equal(
    sfxPreviewSourceTime(5, 1, 0, 8, true),
    4,
    "re-arm would have sought 4s in (quiet tail)"
  );
  assert.equal(sfxCrossedStart(5.0, 5.2, 1, 0, 8), false);
}

// Late canplay must keep the fire-time offset, not a later absTime
{
  const fireAbs = 4.016;
  const from = sfxPreviewSourceTime(fireAbs, 4, 0.5, 2, false);
  const laterAbs = fireAbs + 0.2;
  const lateRecompute = sfxPreviewSourceTime(laterAbs, 4, 0.5, 2, true);
  assert.equal(from, 0.5);
  assert.ok(lateRecompute > 0.65, "old path skipped the transient after load delay");
}

// Resume mid-hit seeks into the remaining tail (matches export adelay position)
{
  const s = createPreviewSession([longHit]);
  s.play(3.5);
  assert.equal(s.plays.length, 1);
  assert.equal(s.plays[0].mode, "catchup");
  assert.equal(s.plays[0].from, 2.5);
}

// Playhead spike past the sample (old leftover source-time glitch) must not fire
{
  const s = createPreviewSession([laterHit]);
  s.play(4.9);
  s.tick(8.0, { advancing: true });
  s.tick(8.0);
  assert.equal(s.plays.length, 0, "jumping past the end must not play the hit");
}

console.log("sfx preview session tests passed");
