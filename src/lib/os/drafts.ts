import { keepSoon, readKept } from "@/lib/os/keep";

const KEY = "arc-drafts-v1";

let cache: Record<string, string> | null = null;

function bag(): Record<string, string> {
  if (cache) return cache;
  const store = readKept(KEY);
  if (!store) {
    cache = {};
    return cache;
  }
  try {
    const raw = JSON.parse(store) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      cache = {};
      return cache;
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") out[key.slice(0, 80)] = value.slice(0, 2000);
    }
    cache = out;
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

export function getDraft(key: string) {
  return bag()[key] ?? "";
}

export function putDraft(key: string, value: string) {
  const all = bag();
  const next = value.slice(0, 2000);
  if (!next) delete all[key];
  else all[key] = next;
  cache = all;
  keepSoon(KEY, JSON.stringify(all));
}
