/** Shared types for previous-film archives (safe for client + server). */

export type ArchiveReason = "pre-reset" | "post-export" | "pre-restore" | "manual";

export interface ProjectArchiveMeta {
  id: string;
  createdAt: string;
  reason: ArchiveReason;
  channelSlug: string;
  channelName?: string;
  number: number | null;
  version: number | null;
  /** Human label, e.g. ranking-animals-12 or "Before reset" */
  label: string;
  /** First title line preview */
  titlePreview: string;
  readyClipCount: number;
}
