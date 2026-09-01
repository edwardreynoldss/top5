import assert from "node:assert/strict";

function splitSfxNameExt(fileName) {
  const base = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0) return { stem: base, ext: "" };
  return { stem: base.slice(0, i), ext: base.slice(i) };
}

function sanitizeSfxFileName(currentFileName, requested) {
  const { ext } = splitSfxNameExt(currentFileName);
  let raw = String(requested || "").trim();
  raw = raw.replace(/\\/g, "/").split("/").pop() || "";
  raw = raw.replace(/[<>:"|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (!raw) throw new Error("Name cannot be empty");
  const req = splitSfxNameExt(raw);
  let stem = req.stem.trim();
  if (!stem) throw new Error("Name cannot be empty");
  if (stem === "." || stem === "..") throw new Error("Invalid name");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `${stem}-sfx`;
  return `${stem}${ext || req.ext || ""}`;
}

function uniqueSfxFileName(desired, taken, keep) {
  const used = new Set(taken);
  if (keep) used.delete(keep);
  if (!used.has(desired)) return desired;
  const { stem, ext } = splitSfxNameExt(desired);
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}-${n}${ext}`;
  }
  return next;
}

function remapPlacements(assets, placements, fromMediaId, next) {
  const idMap = new Map();
  const sfxAssets = assets.map((a) => {
    if (a.mediaId !== fromMediaId && a.id !== fromMediaId) return a;
    const nextId = a.id === a.mediaId || a.id === fromMediaId ? next.mediaId : a.id;
    if (a.id !== nextId) idMap.set(a.id, nextId);
    return { ...a, id: nextId, mediaId: next.mediaId, mediaUrl: next.mediaUrl, fileName: next.fileName };
  });
  const sfxPlacements = placements.map((p) =>
    idMap.has(p.assetId) ? { ...p, assetId: idMap.get(p.assetId) } : p
  );
  return { sfxAssets, sfxPlacements };
}

assert.equal(sanitizeSfxFileName("boom.mp3", "Vine Boom"), "Vine Boom.mp3");
assert.equal(sanitizeSfxFileName("hit.wav", "hit.wav"), "hit.wav");
assert.equal(sanitizeSfxFileName("a.mp3", "../secret"), "secret.mp3");
assert.equal(sanitizeSfxFileName("a.mp3", "foo.wav"), "foo.mp3");
assert.throws(() => sanitizeSfxFileName("a.mp3", "   "));

assert.equal(uniqueSfxFileName("boom.mp3", ["clap.mp3"], "boom.mp3"), "boom.mp3");
assert.equal(uniqueSfxFileName("boom.mp3", ["boom.mp3"], "old.mp3"), "boom-2.mp3");
assert.equal(
  uniqueSfxFileName("boom.mp3", ["boom.mp3", "boom-2.mp3"], "x.mp3"),
  "boom-3.mp3"
);

const remapped = remapPlacements(
  [{ id: "drop__old.mp3", mediaId: "drop__old.mp3", fileName: "old.mp3", mediaUrl: "/api/sfx/file/old.mp3" }],
  [{ id: "p1", assetId: "drop__old.mp3", startAt: 1 }],
  "drop__old.mp3",
  { mediaId: "drop__new.mp3", mediaUrl: "/api/sfx/file/new.mp3", fileName: "new.mp3" }
);
assert.equal(remapped.sfxAssets[0].id, "drop__new.mp3");
assert.equal(remapped.sfxAssets[0].fileName, "new.mp3");
assert.equal(remapped.sfxPlacements[0].assetId, "drop__new.mp3");

const uuidKept = remapPlacements(
  [{ id: "uuid-1", mediaId: "drop__old.mp3", fileName: "old.mp3", mediaUrl: "/x" }],
  [{ id: "p1", assetId: "uuid-1", startAt: 0 }],
  "drop__old.mp3",
  { mediaId: "drop__new.mp3", mediaUrl: "/n", fileName: "new.mp3" }
);
assert.equal(uuidKept.sfxAssets[0].id, "uuid-1");
assert.equal(uuidKept.sfxAssets[0].mediaId, "drop__new.mp3");
assert.equal(uuidKept.sfxPlacements[0].assetId, "uuid-1");

console.log("sfx rename/delete helper tests passed");
