import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/lib/emojiData.ts", "utf8");

// The generated file is plain data, so pull the rows out without a TS loader.
const rows = [...src.matchAll(/^\s*\[("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*")\],$/gm)].map(
  (m) => [JSON.parse(m[1]), JSON.parse(m[2])]
);
const groups = [...src.matchAll(/^\s*name: ("(?:[^"\\]|\\.)*"),$/gm)].map((m) =>
  JSON.parse(m[1])
);

// --- the set is the full standard keyboard, not a token handful ---
assert.ok(rows.length > 1500, `expected the full emoji set, got ${rows.length}`);
assert.equal(groups.length, 9, `expected 9 keyboard groups, got ${groups.length}`);
for (const expected of [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
]) {
  assert.ok(groups.includes(expected), `missing group ${expected}`);
}

// --- every row is a usable character plus a searchable name ---
for (const [char, name] of rows) {
  assert.ok(char.length > 0, "empty emoji character");
  assert.ok(name.length > 0, `empty name for ${char}`);
  assert.equal(name, name.toLowerCase(), `name should be lowercase for search: ${name}`);
  assert.ok(!/\s{2,}/.test(name), `double spaces in ${name}`);
}

// --- no duplicates, which would show twice in the grid ---
{
  const seen = new Set();
  const dupes = [];
  for (const [char] of rows) {
    if (seen.has(char)) dupes.push(char);
    seen.add(char);
  }
  assert.equal(dupes.length, 0, `duplicate emoji: ${dupes.slice(0, 5).join(" ")}`);
}

// --- skin-tone modifier variants are excluded (base emoji only) ---
assert.ok(
  !rows.some(([, name]) => name.includes("skin tone")),
  "skin tone variants should not be in the picker list"
);

// --- spot check emoji people actually reach for ---
const chars = new Set(rows.map((r) => r[0]));
for (const c of ["😂", "🔥", "😍", "🐱", "🎉", "💀", "🇺🇸"]) {
  assert.ok(chars.has(c), `missing common emoji ${c}`);
}

// --- search by name works for the obvious queries ---
const byName = (q) => rows.filter(([, n]) => n.includes(q));
assert.ok(byName("joy").length > 0, "'joy' should match");
assert.ok(byName("cat").length > 3, "'cat' should match several");
assert.ok(byName("fire").length > 0, "'fire' should match");

console.log(`emoji data tests passed (${rows.length} emoji, ${groups.length} groups)`);
