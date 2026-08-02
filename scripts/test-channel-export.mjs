import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function channelSlug(name) {
  const s = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "channel";
}

function channelExportBaseName(slug, number, version) {
  const safe = channelSlug(slug);
  if (version <= 1) return `ranking-${safe}-${number}`;
  return `ranking-${safe}-${number}.${version}`;
}

function planChannelExport(state, slot) {
  const slug =
    state.channels.some((c) => c.slug === state.activeSlug)
      ? state.activeSlug
      : state.channels[0]?.slug || "animals";

  let nextState = { ...state, activeSlug: slug, nextNumber: { ...state.nextNumber } };
  let nextSlot;

  if (slot && slot.channelSlug === slug && slot.number >= 1) {
    nextSlot = {
      channelSlug: slug,
      number: slot.number,
      version: Math.max(1, slot.version || 1) + 1,
    };
  } else {
    const n = Math.max(1, Math.floor(nextState.nextNumber[slug] || 1));
    nextSlot = { channelSlug: slug, number: n, version: 1 };
    nextState = {
      ...nextState,
      nextNumber: { ...nextState.nextNumber, [slug]: n + 1 },
    };
  }

  const fileName = `${channelExportBaseName(nextSlot.channelSlug, nextSlot.number, nextSlot.version)}.mp4`;
  return {
    state: nextState,
    slot: nextSlot,
    fileName,
    relativePath: `exports/${nextSlot.channelSlug}/${fileName}`,
  };
}

// Slugs
assert.equal(channelSlug("Animals"), "animals");
assert.equal(channelSlug("Funny Cats!"), "funny-cats");

// First export Animals → ranking-animals-1, counter bumps to 2
{
  let state = {
    channels: [
      { name: "Animals", slug: "animals" },
      { name: "Funny", slug: "funny" },
    ],
    activeSlug: "animals",
    nextNumber: { animals: 1, funny: 1 },
  };
  const a = planChannelExport(state, null);
  assert.equal(a.fileName, "ranking-animals-1.mp4");
  assert.equal(a.relativePath, "exports/animals/ranking-animals-1.mp4");
  assert.equal(a.slot.version, 1);
  assert.equal(a.state.nextNumber.animals, 2);
  state = a.state;

  // Re-export same clips → ranking-animals-1.2 (counter stays 2)
  const b = planChannelExport(state, a.slot);
  assert.equal(b.fileName, "ranking-animals-1.2.mp4");
  assert.equal(b.slot.number, 1);
  assert.equal(b.slot.version, 2);
  assert.equal(b.state.nextNumber.animals, 2);

  const c = planChannelExport(b.state, b.slot);
  assert.equal(c.fileName, "ranking-animals-1.3.mp4");

  // Reset clears slot → next is ranking-animals-2
  const d = planChannelExport(c.state, null);
  assert.equal(d.fileName, "ranking-animals-2.mp4");
  assert.equal(d.state.nextNumber.animals, 3);
}

// Funny is independent
{
  const state = {
    channels: [
      { name: "Animals", slug: "animals" },
      { name: "Funny", slug: "funny" },
    ],
    activeSlug: "funny",
    nextNumber: { animals: 5, funny: 1 },
  };
  const a = planChannelExport(state, null);
  assert.equal(a.fileName, "ranking-funny-1.mp4");
  assert.equal(a.state.nextNumber.funny, 2);
  assert.equal(a.state.nextNumber.animals, 5);
}

// Folder ensure helper (filesystem)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-exp-"));
  const animals = path.join(dir, "animals");
  fs.mkdirSync(animals, { recursive: true });
  assert.ok(fs.existsSync(animals));
}

console.log("channel export naming tests passed");
