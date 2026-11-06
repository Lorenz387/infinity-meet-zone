export type ClipNote = { id: string; atSec: number; text: string; by: string };
export type Clip = { id: string; name: string; at: number; seconds: number; notes: ClipNote[] };

const DB = "arc-clips";
const STORE = "clips";
const MAX_COUNT = 6;
const MAX_BYTES = 12_000_000;

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

function meta(row: Clip): Clip {
  return {
    id: row.id,
    name: row.name,
    at: row.at,
    seconds: row.seconds,
    notes: Array.isArray(row.notes) ? row.notes : [],
  };
}

export async function listClips(): Promise<Clip[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => {
      const rows = (request.result as Clip[]).map(meta).sort((a, b) => b.at - a.at);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function putClip(input: { name: string; seconds: number; blob: Blob }): Promise<{ ok: true; clip: Clip } | { ok: false; error: string }> {
  if (input.blob.size > MAX_BYTES) return { ok: false, error: "Die Aufnahme ist größer als 12 MB." };
  const current = await listClips();
  if (current.length >= MAX_COUNT) return { ok: false, error: "Sechs Aufnahmen liegen schon. Nimm eine weg." };
  const clip: Clip & { blob: Blob } = {
    id: `c-${Date.now().toString(36)}`,
    name: input.name.trim().slice(0, 40) || "Update",
    at: Date.now(),
    seconds: Math.min(120, Math.max(1, Math.round(input.seconds))),
    notes: [],
    blob: input.blob,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(clip);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  window.dispatchEvent(new Event("arc-clips"));
  return { ok: true, clip: meta(clip) };
}

export async function blobOfClip(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as { blob?: Blob } | undefined)?.blob ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function commentClip(id: string, note: ClipNote) {
  const db = await openDb();
  const row = await new Promise<(Clip & { blob?: Blob }) | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as Clip & { blob?: Blob });
    request.onerror = () => reject(request.error);
  });
  if (!row) return;
  row.notes = [...(row.notes ?? []), note].slice(-40);
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(row);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  window.dispatchEvent(new Event("arc-clips"));
}

export async function forgetClip(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  window.dispatchEvent(new Event("arc-clips"));
}
