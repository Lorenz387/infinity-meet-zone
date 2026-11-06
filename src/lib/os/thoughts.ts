import { setCue } from "@/lib/os/cue";
import { addNote } from "@/lib/os/desk";
import { keepNow, readKept } from "@/lib/os/keep";

export type ThoughtVia = "zeigen" | "sagen" | "weitergeben";

export type Thought = { id: string; at: number; text: string; via: ThoughtVia };

const KEY = "arc-thoughts-v1";
const listeners = new Set<() => void>();
let seq = 0;

export function clipThought(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 140);
}

function read(): Thought[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(readKept(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as Thought;
        const text = typeof item.text === "string" ? clipThought(item.text) : "";
        if (!text) return null;
        const via: ThoughtVia = item.via === "sagen" || item.via === "weitergeben" ? item.via : "zeigen";
        return { id: typeof item.id === "string" ? item.id : `g-${item.at}`, at: typeof item.at === "number" ? item.at : Date.now(), text, via };
      })
      .filter((item): item is Thought => !!item)
      .slice(0, 40);
  } catch {
    return [];
  }
}

function write(items: Thought[]) {
  keepNow(KEY, JSON.stringify(items.slice(0, 40)));
  listeners.forEach((listen) => listen());
}

export function listThoughts() {
  return read();
}

export function subscribeThoughts(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

export function showThought(value: string, via: ThoughtVia): Thought | null {
  const text = clipThought(value);
  if (!text) return null;
  seq += 1;
  const thought: Thought = { id: `g-${Date.now().toString(36)}-${seq.toString(36)}`, at: Date.now(), text, via };
  write([thought, ...read()].slice(0, 40));
  setCue(text);
  if (via === "weitergeben") addNote(`Gedanke: ${text}`);
  return thought;
}

export function exportThoughts(): Thought[] {
  return read();
}

export function importThoughts(value: unknown) {
  if (!Array.isArray(value)) return 0;
  const incoming: Thought[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Thought;
    const text = typeof item.text === "string" ? clipThought(item.text) : "";
    if (!text) continue;
    const via: ThoughtVia = item.via === "sagen" || item.via === "weitergeben" ? item.via : "zeigen";
    incoming.push({
      id: typeof item.id === "string" ? item.id.slice(0, 40) : `g-${item.at}`,
      at: typeof item.at === "number" ? item.at : Date.now(),
      text,
      via,
    });
  }
  const by = new Map(read().map((item) => [item.id, item]));
  let added = 0;
  for (const item of incoming) {
    const prev = by.get(item.id);
    if (!prev) added += 1;
    if (!prev || item.at >= prev.at) by.set(item.id, item);
  }
  write([...by.values()].sort((a, b) => b.at - a.at).slice(0, 40));
  return added;
}
