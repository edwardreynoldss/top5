import assert from "node:assert/strict";

/**
 * Live hits play from trimStart so the attack matches ffmpeg's atrim.
 * Catch-up after pause/seek jumps into the sample to match adelay.
 */
function previewSeek(absNow, start, trimStart, trimEnd, catchup) {
  const ts = Math.max(0, trimStart);
  const te = Math.max(ts + 0.05, trimEnd);
  const into = catchup ? Math.max(0, absNow - start) : 0;
  return Math.min(ts + into, te - 0.02);
}

/** Where the rendered mix is inside the sample at this timeline instant. */
function renderPosition(absNow, start, trimStart) {
  return trimStart + (absNow - start);
}

// --- fired on time: both start at the trim point ---
{
  const start = 4;
  assert.equal(previewSeek(4, start, 0.5, 2, false), 0.5);
  assert.equal(renderPosition(4, start, 0.5), 0.5);
}

// --- a frame late during live play: still start at the attack, not seek into it ---
{
  const start = 4;
  const absNow = 4 + 1 / 60;
  const p = previewSeek(absNow, start, 0.5, 2, false);
  assert.equal(p, 0.5, "live play must not skip the transient");
  assert.ok(p - 0.5 < 0.02, `into=${p - 0.5}`);
}

// --- resume/seek mid-sample still lines up with the render ---
{
  const start = 10;
  const absNow = 10.4;
  assert.ok(
    Math.abs(
      previewSeek(absNow, start, 0, 3, true) - renderPosition(absNow, start, 0)
    ) < 1e-9
  );
}

// --- never seeks past the trimmed tail ---
{
  assert.equal(previewSeek(99, 0, 0, 1.5, true), 1.48);
}

/**
 * Export cuts SFX at the end of the video: the concat audio is the first amix
 * input with duration=first, and -shortest bounds the muxed output.
 */
function buildMixArgs({ sfxCount }) {
  const mixInputs = ["[a0]"];
  for (let i = 0; i < sfxCount; i++) mixInputs.push(`[s${i}]`);
  return {
    filter: `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[aout]`,
    args: ["-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-shortest"],
  };
}

{
  const { filter, args } = buildMixArgs({ sfxCount: 2 });
  assert.ok(filter.startsWith("[a0]"), "video audio must be the first amix input");
  assert.ok(filter.includes("duration=first"), "mix ends with the video audio");
  assert.ok(args.includes("-shortest"), "output is bounded by the video stream");
}

console.log("sfx preview/render parity tests passed");
