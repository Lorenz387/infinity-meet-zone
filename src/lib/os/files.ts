export type ArcFile = { id: string; name: string; type: string; size: number; at: number };

const DB = "arc-files";
const STORE = "files";
const MAX_BYTES = 8_000_000;
const MAX_COUNT = 16;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function meta(row: { id: string; name: string; type: string; size: number; at: number }): ArcFile {
  return { id: row.id, name: row.name, type: row.type, size: row.size, at: row.at };
}

export async function listFiles(): Promise<ArcFile[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => {
      const rows = (request.result as ArcFile[]).map(meta).sort((a, b) => b.at - a.at);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function putFile(file: File): Promise<{ ok: true; file: ArcFile } | { ok: false; error: string }> {
  if (file.size > MAX_BYTES) return { ok: false, error: "Die Datei ist größer als 8 MB." };
  const current = await listFiles();
  if (current.length >= MAX_COUNT) return { ok: false, error: "Es liegen schon 16 Dateien. Nimm eine weg." };
  const row = {
    id: `f-${Date.now().toString(36)}`,
    name: file.name.slice(0, 80) || "datei",
    type: file.type || "application/octet-stream",
    size: file.size,
    at: Date.now(),
    blob: file,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(row);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  window.dispatchEvent(new Event("arc-files"));
  return { ok: true, file: meta(row) };
}

export async function blobOf(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => {
      const row = request.result as { blob?: Blob } | undefined;
      resolve(row?.blob ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function forgetFile(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  window.dispatchEvent(new Event("arc-files"));
}

export function fileKind(file: ArcFile) {
  if (file.type.startsWith("image/")) return "bild";
  if (file.type.startsWith("text/") || /\.(txt|md|json|csv|svg)$/i.test(file.name)) return "text";
  if (file.type.startsWith("audio/")) return "ton";
  if (file.type.startsWith("video/")) return "video";
  return "datei";
}
