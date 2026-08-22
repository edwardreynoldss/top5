/**
 * The clip card takes the ranking as a bare number and the finished-clip line
 * renders it as "Cat Running - 8.11/10". Preview and export share the helper, so
 * this guards the exact string both of them draw.
 */
import assert from "node:assert/strict";

/** Mirrors formatClipScore in src/lib/defaults.ts */
function formatClipScore(raw) {
  const score = (raw || "").trim();
  if (!score || /^\/\s*\d+(?:[.,]\d+)?$/.test(score)) return "";
  if (/^\d+(?:[.,]\d+)?$/.test(score)) return `${score}/10`;
  const outOf = score.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  return outOf ? `${outOf[1]}/${outOf[2]}` : score;
}

/** Mirrors clipShortText in src/lib/defaults.ts */
function clipShortText(clip) {
  const name = (clip.label || "").trim();
  const score = formatClipScore(clip.score);
  if (name && score) return `${name} - ${score}`;
  return name || score;
}

// --- the number the user types gets the "/10" ---
{
  assert.equal(formatClipScore("8.11"), "8.11/10");
  assert.equal(formatClipScore("9"), "9/10");
  assert.equal(formatClipScore("10"), "10/10");
  assert.equal(formatClipScore(" 8.11 "), "8.11/10", "surrounding spaces are trimmed");
}

// --- an already-suffixed score is never doubled ---
{
  assert.equal(formatClipScore("8.11/10"), "8.11/10");
  assert.equal(formatClipScore("8.11 / 10"), "8.11/10", "spacing around / is tidied");
  assert.equal(formatClipScore("8/5"), "8/5", "a custom denominator is kept");
}

// --- nothing to show ---
{
  assert.equal(formatClipScore(""), "");
  assert.equal(formatClipScore("   "), "");
  assert.equal(formatClipScore(undefined), "");
  assert.equal(formatClipScore(null), "");
  assert.equal(formatClipScore("/10"), "", "a bare denominator is not a score");
}

// --- anything that isn't a number survives as typed ---
{
  assert.equal(formatClipScore("8,11"), "8,11/10", "comma decimals still get /10");
  assert.equal(formatClipScore("n/a"), "n/a");
  assert.equal(formatClipScore("perfect"), "perfect");
  assert.equal(formatClipScore("8.11/10 🔥"), "8.11/10 🔥");
}

// --- the finished-clip line the user asked for ---
{
  assert.equal(
    clipShortText({ label: "Cat Running", score: "8.11" }),
    "Cat Running - 8.11/10"
  );
  assert.equal(
    clipShortText({ label: "  Cat Running  ", score: "8.11" }),
    "Cat Running - 8.11/10"
  );
  assert.equal(
    clipShortText({ label: "Cat Running", score: "" }),
    "Cat Running",
    "no ranking means no trailing dash"
  );
  assert.equal(clipShortText({ label: "", score: "8.11" }), "8.11/10");
  assert.equal(clipShortText({}), "");
  // Restored projects saved before the "/10" suffix keep reading the same
  assert.equal(
    clipShortText({ label: "Careless Cat", score: "8.12/10" }),
    "Careless Cat - 8.12/10"
  );
}

console.log("clip score format tests passed");
