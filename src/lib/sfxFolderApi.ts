/** Client helpers for renaming/deleting files in the sfx/ folder. */

export async function renameFolderSfx(fileName: string, nextName: string) {
  const res = await fetch(`/api/sfx/file/${encodeURIComponent(fileName)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: nextName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not rename sound");
  return data as {
    fileName: string;
    mediaId: string;
    mediaUrl: string;
    renamed: boolean;
  };
}

export async function deleteFolderSfx(fileName: string) {
  const res = await fetch(`/api/sfx/file/${encodeURIComponent(fileName)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not delete sound");
  return data as { ok: boolean; fileName: string };
}
