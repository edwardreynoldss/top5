/** IndexedDB cache for uploaded media blobs (SFX reuse across restarts). */

const DB_NAME = "rankshorts-media-v1";
const STORE = "blobs";
const DB_VERSION = 1;

type StoredBlob = {
  mediaId: string;
  blob: Blob;
  fileName: string;
  mime: string;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "mediaId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
  });
}

export async function putMediaBlob(
  mediaId: string,
  blob: Blob,
  fileName = "audio"
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      mediaId,
      blob,
      fileName,
      mime: blob.type || "application/octet-stream",
      savedAt: Date.now(),
    } satisfies StoredBlob);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB put failed"));
  });
  db.close();
}

export async function getMediaBlob(mediaId: string): Promise<StoredBlob | null> {
  try {
    const db = await openDb();
    const row = await new Promise<StoredBlob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(mediaId);
      req.onsuccess = () => resolve((req.result as StoredBlob) || null);
      req.onerror = () => reject(req.error || new Error("IDB get failed"));
    });
    db.close();
    return row;
  } catch {
    return null;
  }
}

export async function deleteMediaBlob(mediaId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(mediaId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IDB delete failed"));
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function mediaUrlReachable(url: string): Promise<boolean> {
  if (!url || url.startsWith("blob:")) return false;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.ok) return true;
    // Some hosts reject HEAD — try a tiny ranged GET
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      cache: "no-store",
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}
