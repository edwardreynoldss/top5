/**
 * Client helpers for Open previous films (server project archives).
 */

import type { EditorProject } from "./types";
import type { ArchiveReason, ProjectArchiveMeta } from "./projectArchiveTypes";

export type { ArchiveReason, ProjectArchiveMeta };

export async function listFilmArchives(): Promise<ProjectArchiveMeta[]> {
  const res = await fetch("/api/projects/archives");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list previous films");
  return Array.isArray(data.items) ? data.items : [];
}

export async function saveFilmArchive(opts: {
  project: EditorProject;
  reason: ArchiveReason;
  channelSlug?: string;
  channelName?: string;
  number?: number | null;
  version?: number | null;
  label?: string;
  force?: boolean;
}): Promise<ProjectArchiveMeta | null> {
  const res = await fetch("/api/projects/archives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save film");
  if (data.skipped) return null;
  return (data.meta as ProjectArchiveMeta) || null;
}

export async function fetchFilmArchive(id: string): Promise<{
  meta: ProjectArchiveMeta;
  project: EditorProject;
}> {
  const res = await fetch(`/api/projects/archives/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to open film");
  return {
    meta: data as ProjectArchiveMeta,
    project: data.project as EditorProject,
  };
}

export async function deleteFilmArchive(id: string): Promise<void> {
  const res = await fetch(`/api/projects/archives/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete film");
}

export function formatArchiveWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function reasonBadge(reason: ArchiveReason): string {
  switch (reason) {
    case "post-export":
      return "Exported";
    case "pre-reset":
      return "Before reset";
    case "pre-restore":
      return "Before open";
    case "manual":
      return "Checkpoint";
    default:
      return "Saved";
  }
}
