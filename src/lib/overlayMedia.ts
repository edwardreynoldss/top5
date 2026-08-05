/** Client-safe overlay media URL helpers (no Node fs). */

export function isOverlayMediaId(mediaId: string) {
  return mediaId.startsWith("overlay__") || mediaId.startsWith("overlaydrop__");
}

export function isBundledOverlayMediaId(mediaId: string) {
  return mediaId.startsWith("overlay__");
}

export function overlayFileName(mediaId: string) {
  if (mediaId.startsWith("overlay__")) return mediaId.slice("overlay__".length);
  if (mediaId.startsWith("overlaydrop__")) return mediaId.slice("overlaydrop__".length);
  return null;
}

export function overlayMediaUrl(mediaId: string, fallback?: string | null) {
  if (fallback && fallback.startsWith("/")) return fallback;
  const name = overlayFileName(mediaId);
  if (!name) return fallback || "";
  if (isBundledOverlayMediaId(mediaId)) {
    return `/overlays/${encodeURIComponent(name)}`;
  }
  return `/api/overlays/file/${encodeURIComponent(name)}`;
}
