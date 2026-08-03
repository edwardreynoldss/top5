/**
 * Server-side editor project archives ("previous films").
 * Stored under projects/{id}/ as meta.json + project.json.
 * Retained for ~2 months; snapshotted before Reset and after Export.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "fs";
import path from "path";
import { channelSlug, channelExportBaseName } from "./channels";
import { ensureProjectsDir, PROJECTS_DIR } from "./paths";
import type { EditorProject } from "./types";
import type { ArchiveReason, ProjectArchiveMeta } from "./projectArchiveTypes";

export type { ArchiveReason, ProjectArchiveMeta };

/** Keep archives for 60 days (~2 months). */
export const ARCHIVE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
/** Safety cap so the folder cannot grow without bound. */
export const ARCHIVE_MAX_COUNT = 200;

export interface ProjectArchive extends ProjectArchiveMeta {
  project: EditorProject;
}

function safeIdSegment(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function titlePreviewFromProject(project: EditorProject): string {
  const lines = project.settings?.title?.lines || [];
  const words = lines.flatMap((l) => l.words || []).map((w) => w.text?.trim()).filter(Boolean);
  const text = words.join(" ").trim();
  return text ? text.slice(0, 80) : "Untitled ranking";
}

function readyClipCount(project: EditorProject): number {
  return (project.clips || []).filter((c) => c.mediaId && c.status !== "empty").length;
}

function archiveDir(id: string) {
  return path.join(PROJECTS_DIR, id);
}

function isSafeArchiveId(id: string) {
  return /^[a-zA-Z0-9._-]+$/.test(id) && id.length > 0 && id.length < 180;
}

export function buildArchiveLabel(opts: {
  reason: ArchiveReason;
  channelSlug: string;
  number: number | null;
  version: number | null;
}): string {
  const slug = channelSlug(opts.channelSlug || "film");
  if (opts.number && opts.number > 0) {
    const base = channelExportBaseName(slug, opts.number, opts.version || 1);
    if (opts.reason === "pre-reset") return `${base} · before reset`;
    if (opts.reason === "pre-restore") return `${base} · before open`;
    if (opts.reason === "manual") return `${base} · checkpoint`;
    return base;
  }
  if (opts.reason === "pre-reset") return `${slug} · before reset`;
  if (opts.reason === "pre-restore") return `${slug} · before open`;
  if (opts.reason === "manual") return `${slug} · checkpoint`;
  return `${slug} · saved film`;
}

function readMetaFile(dir: string): ProjectArchiveMeta | null {
  const metaPath = path.join(dir, "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Partial<ProjectArchiveMeta>;
    if (!raw.id || !raw.createdAt) return null;
    return {
      id: String(raw.id),
      createdAt: String(raw.createdAt),
      reason: (raw.reason as ArchiveReason) || "manual",
      channelSlug: String(raw.channelSlug || "film"),
      channelName: raw.channelName ? String(raw.channelName) : undefined,
      number: typeof raw.number === "number" ? raw.number : null,
      version: typeof raw.version === "number" ? raw.version : null,
      label: String(raw.label || raw.id),
      titlePreview: String(raw.titlePreview || "Untitled ranking"),
      readyClipCount: Math.max(0, Math.floor(Number(raw.readyClipCount) || 0)),
    };
  } catch {
    return null;
  }
}

/** Delete archives older than retention, then trim to max count (oldest first). */
export function pruneProjectArchives(now = Date.now()) {
  ensureProjectsDir();
  const cutoff = now - ARCHIVE_RETENTION_MS;
  const entries: { id: string; createdAtMs: number; dir: string }[] = [];

  for (const name of readdirSync(PROJECTS_DIR)) {
    if (name.startsWith(".")) continue;
    const dir = archiveDir(name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = readMetaFile(dir);
    const createdAtMs = meta ? Date.parse(meta.createdAt) : NaN;
    if (!Number.isFinite(createdAtMs) || createdAtMs < cutoff) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      continue;
    }
    entries.push({ id: name, createdAtMs, dir });
  }

  entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  for (const extra of entries.slice(ARCHIVE_MAX_COUNT)) {
    try {
      rmSync(extra.dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export function listProjectArchives(): ProjectArchiveMeta[] {
  ensureProjectsDir();
  pruneProjectArchives();
  const items: ProjectArchiveMeta[] = [];
  for (const name of readdirSync(PROJECTS_DIR)) {
    if (name.startsWith(".")) continue;
    const dir = archiveDir(name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = readMetaFile(dir);
    if (meta) items.push(meta);
  }
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return items;
}

export function readProjectArchive(id: string): ProjectArchive | null {
  if (!isSafeArchiveId(id)) return null;
  ensureProjectsDir();
  const dir = archiveDir(id);
  const meta = readMetaFile(dir);
  const projectPath = path.join(dir, "project.json");
  if (!meta || !existsSync(projectPath)) return null;
  try {
    const project = JSON.parse(readFileSync(projectPath, "utf8")) as EditorProject;
    return { ...meta, project };
  } catch {
    return null;
  }
}

export function deleteProjectArchive(id: string): boolean {
  if (!isSafeArchiveId(id)) return false;
  const dir = archiveDir(id);
  if (!existsSync(dir)) return false;
  try {
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stable ids so reopen / peek / re-export overwrite instead of stacking duplicates.
 * - pre-restore → one global "before open" slot
 * - same film slot (channel + number + version) for other reasons → one slot each
 */
export function stableArchiveId(opts: {
  reason: ArchiveReason;
  channelSlug: string;
  number: number | null;
  version: number | null;
}): string {
  const slug = safeIdSegment(opts.channelSlug) || "film";
  const n = opts.number && opts.number > 0 ? opts.number : 0;
  const v = opts.version && opts.version > 0 ? opts.version : 1;
  if (opts.reason === "pre-restore") return "safety-before-open";
  return `slot-${opts.reason}-${slug}-n${n}-v${v}`;
}

function sameFilmSlot(
  meta: ProjectArchiveMeta,
  opts: {
    reason: ArchiveReason;
    channelSlug: string;
    number: number | null;
    version: number | null;
  }
) {
  if (meta.reason !== opts.reason) return false;
  if (opts.reason === "pre-restore") return true;
  return (
    meta.channelSlug === opts.channelSlug &&
    (meta.number ?? 0) === (opts.number ?? 0) &&
    (meta.version ?? 1) === (opts.version ?? 1)
  );
}

/** Remove legacy/timestamped duplicates for this overwrite slot. */
function removeMatchingArchives(
  keepId: string,
  opts: {
    reason: ArchiveReason;
    channelSlug: string;
    number: number | null;
    version: number | null;
  }
) {
  ensureProjectsDir();
  for (const name of readdirSync(PROJECTS_DIR)) {
    if (name.startsWith(".") || name === keepId) continue;
    const dir = archiveDir(name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = readMetaFile(dir);
    if (!meta || !sameFilmSlot(meta, opts)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export function saveProjectArchive(opts: {
  project: EditorProject;
  reason: ArchiveReason;
  channelSlug?: string;
  channelName?: string;
  number?: number | null;
  version?: number | null;
  label?: string;
}): ProjectArchiveMeta {
  ensureProjectsDir();
  pruneProjectArchives();

  const slot = opts.project.exportSlot;
  const slug = channelSlug(
    opts.channelSlug || slot?.channelSlug || "film"
  );
  const number =
    typeof opts.number === "number"
      ? opts.number
      : typeof slot?.number === "number"
        ? slot.number
        : null;
  const version =
    typeof opts.version === "number"
      ? opts.version
      : typeof slot?.version === "number"
        ? slot.version
        : null;

  const createdAt = new Date().toISOString();
  const reason = opts.reason;
  const id = stableArchiveId({ reason, channelSlug: slug, number, version });

  // Drop older duplicates (timestamped legacy + previous overwrite) for this slot
  removeMatchingArchives(id, { reason, channelSlug: slug, number, version });

  const label =
    opts.label ||
    buildArchiveLabel({ reason, channelSlug: slug, number, version });

  const meta: ProjectArchiveMeta = {
    id,
    createdAt,
    reason,
    channelSlug: slug,
    channelName: opts.channelName,
    number,
    version,
    label,
    titlePreview: titlePreviewFromProject(opts.project),
    readyClipCount: readyClipCount(opts.project),
  };

  const dir = archiveDir(id);
  mkdirSync(dir, { recursive: true });

  // Strip transient noise; keep mediaIds for restore
  const toSave: EditorProject = {
    ...opts.project,
    clips: (opts.project.clips || []).map((c) => ({
      ...c,
      status: c.mediaId ? "ready" : "empty",
      error: undefined,
    })),
    sfxAssets: (opts.project.sfxAssets || []).map((a) => ({
      ...a,
      mediaUrl: a.mediaId ? `/api/media/${a.mediaId}` : a.mediaUrl,
    })),
  };

  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(path.join(dir, "project.json"), JSON.stringify(toSave, null, 2));

  return meta;
}

/** True when the project has at least one clip worth archiving. */
export function projectWorthArchiving(project: EditorProject): boolean {
  return readyClipCount(project) > 0;
}
