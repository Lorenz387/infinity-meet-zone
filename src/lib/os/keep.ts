const soon = new Map<string, string>();
let soonTimer = 0;
const KEEP_NOTE = "Der Browser kann das gerade nicht ablegen. Es bleibt in dieser Sitzung, bis wieder Platz ist.";
let note = "";
const noteListeners = new Set<() => void>();

function warnKeep() {
  if (note === KEEP_NOTE) return;
  note = KEEP_NOTE;
  noteListeners.forEach((listen) => listen());
}

function clearKeep() {
  if (!note) return;
  note = "";
  noteListeners.forEach((listen) => listen());
}

export function getKeepNote() {
  return note;
}

export function subscribeKeep(listen: () => void) {
  noteListeners.add(listen);
  return () => noteListeners.delete(listen);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readKept(key: string): string | null {
  if (soon.has(key)) return soon.get(key) ?? null;
  return storage()?.getItem(key) ?? null;
}

function relieve() {
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem("arc-transcripts-v1");
    if (raw && raw.length > 8_000) {
      const rows = JSON.parse(raw) as unknown[];
      const slim = Array.isArray(rows)
        ? rows.slice(0, 2).map((row) => {
            if (!row || typeof row !== "object") return row;
            const item = row as { name?: unknown; text?: unknown; at?: unknown };
            return {
              name: typeof item.name === "string" ? item.name.slice(0, 80) : "Transkript",
              text: typeof item.text === "string" ? item.text.slice(0, 1500) : "",
              at: typeof item.at === "number" ? item.at : Date.now(),
            };
          })
        : [];
      store.setItem("arc-transcripts-v1", JSON.stringify(slim));
    }
  } catch {
    // The next write still gets one more try.
  }
  try {
    const raw = store.getItem("arc-rooms-v1");
    if (raw && raw.length > 40_000) {
      const all = JSON.parse(raw) as Record<string, { chat?: unknown[]; captions?: unknown[]; ai?: unknown[]; notes?: string }>;
      const keys = Object.keys(all);
      for (const extra of keys.slice(0, Math.max(0, keys.length - 4))) delete all[extra];
      for (const room of Object.values(all)) {
        if (Array.isArray(room.chat)) room.chat = room.chat.slice(-40);
        if (Array.isArray(room.captions)) room.captions = room.captions.slice(-20);
        if (Array.isArray(room.ai)) room.ai = room.ai.slice(-10);
        if (typeof room.notes === "string") room.notes = room.notes.slice(0, 1000);
      }
      store.setItem("arc-rooms-v1", JSON.stringify(all));
    }
  } catch {
    // Jobs, sheets and the cue stay untouched.
  }
}

function write(key: string, value: string) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    relieve();
    try {
      store.setItem(key, value);
      return true;
    } catch {
      warnKeep();
      return false;
    }
  }
}

export function keepNow(key: string, value: string) {
  soon.delete(key);
  if (write(key, value)) {
    if (soon.size === 0) clearKeep();
    return true;
  }
  soon.set(key, value);
  return false;
}

export function flushSoon() {
  if (soonTimer) {
    window.clearTimeout(soonTimer);
    soonTimer = 0;
  }
  for (const [key, value] of [...soon]) {
    if (write(key, value)) soon.delete(key);
  }
  if (soon.size === 0) clearKeep();
}

export function keepSoon(key: string, value: string) {
  if (typeof window === "undefined") return;
  soon.set(key, value);
  if (!storage()) {
    warnKeep();
    return;
  }
  if (soonTimer) return;
  soonTimer = window.setTimeout(flushSoon, 200);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSoon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSoon();
  });
}
