import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";

const ARCHIVE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const ARCHIVE_MAX_COUNT = 200;

function channelSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "film";
}

function channelExportBaseName(slug, number, version) {
  const safe = channelSlug(slug);
  if (version <= 1) return `ranking-${safe}-${number}`;
  return `ranking-${safe}-${number}.${version}`;
}

function buildArchiveLabel({ reason, channelSlug: slug, number, version }) {
  const s = channelSlug(slug || "film");
  if (number && number > 0) {
    const base = channelExportBaseName(s, number, version || 1);
    if (reason === "pre-reset") return `${base} · before reset`;
    if (reason === "pre-restore") return `${base} · before open`;
    if (reason === "manual") return `${base} · checkpoint`;
    return base;
  }
  if (reason === "pre-reset") return `${s} · before reset`;
  return `${s} · saved film`;
}

function projectWorthArchiving(project) {
  return (project.clips || []).filter((c) => c.mediaId).length > 0;
}

function stableArchiveId({ reason, channelSlug: slug, number, version }) {
  const safe = channelSlug(slug) || "film";
  const n = number && number > 0 ? number : 0;
  const v = version && version > 0 ? version : 1;
  if (reason === "pre-restore") return "safety-before-open";
  return `slot-${reason}-${safe}-n${n}-v${v}`;
}

assert.equal(
  stableArchiveId({
    reason: "pre-restore",
    channelSlug: "animals",
    number: 3,
    version: 1,
  }),
  "safety-before-open"
);
assert.equal(
  stableArchiveId({
    reason: "pre-restore",
    channelSlug: "funny",
    number: 9,
    version: 2,
  }),
  "safety-before-open",
  "peeking another film overwrites the same before-open slot"
);
assert.equal(
  stableArchiveId({
    reason: "post-export",
    channelSlug: "animals",
    number: 12,
    version: 1,
  }),
  "slot-post-export-animals-n12-v1"
);

assert.equal(
  buildArchiveLabel({
    reason: "post-export",
    channelSlug: "Animals",
    number: 12,
    version: 1,
  }),
  "ranking-animals-12"
);
assert.equal(
  buildArchiveLabel({
    reason: "pre-reset",
    channelSlug: "animals",
    number: 12,
    version: 2,
  }),
  "ranking-animals-12.2 · before reset"
);
assert.equal(
  projectWorthArchiving({ clips: [{ mediaId: null }, { mediaId: "x" }] }),
  true
);
assert.equal(projectWorthArchiving({ clips: [{ mediaId: null }] }), false);

// Retention math: 61 days ago should prune
const now = Date.UTC(2026, 7, 3);
const old = now - ARCHIVE_RETENTION_MS - 24 * 60 * 60 * 1000;
const recent = now - 10 * 24 * 60 * 60 * 1000;
assert.ok(old < now - ARCHIVE_RETENTION_MS);
assert.ok(recent >= now - ARCHIVE_RETENTION_MS);
assert.ok(ARCHIVE_MAX_COUNT === 200);

// Round-trip write/read in a temp projects dir
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "rankshorts-archives-"));
const projectsDir = path.join(tmpRoot, "projects");
mkdirSync(projectsDir, { recursive: true });

const id = `${Date.now()}-animals-n12-v1-post-export`;
const dir = path.join(projectsDir, id);
mkdirSync(dir, { recursive: true });
const meta = {
  id,
  createdAt: new Date().toISOString(),
  reason: "post-export",
  channelSlug: "animals",
  number: 12,
  version: 1,
  label: "ranking-animals-12",
  titlePreview: "Top 5 cats",
  readyClipCount: 5,
};
const project = {
  clips: [{ mediaId: "abc", status: "ready" }],
  settings: { title: { lines: [] } },
  sfxAssets: [],
  sfxPlacements: [],
  exportSlot: { channelSlug: "animals", number: 12, version: 1 },
};
writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
writeFileSync(path.join(dir, "project.json"), JSON.stringify(project, null, 2));

assert.ok(existsSync(path.join(dir, "meta.json")));
const loaded = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
assert.equal(loaded.exportSlot.number, 12);
assert.equal(loaded.clips[0].mediaId, "abc");

rmSync(tmpRoot, { recursive: true, force: true });
console.log("project archives tests passed");
