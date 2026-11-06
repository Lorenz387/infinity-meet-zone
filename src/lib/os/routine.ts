import { keepSoon, readKept } from "@/lib/os/keep";

export type RoutineSlot = "morgen" | "tag" | "abend";

export type Reflection = { did: string; stuck: string; next: string };

const LINES: Record<RoutineSlot, string[]> = {
  morgen: ["Was ist der eine Auftrag heute?", "Wen rufst du zuerst an?", "Was bleibt liegen, wenn du nichts tust?", "Was muss vor dem ersten Termin stehen?"],
  tag: ["Was ist der nächste Schritt?", "Was blockiert gerade?", "Wem fehlt eine Antwort?", "Was kannst du in zehn Minuten fertig machen?"],
  abend: ["Was ist heute fertig geworden?", "Wo hing es?", "Was nimmst du morgen mit?", "Was lässt du bewusst liegen?"],
};

const CUSTOM = "arc-routine-v1";
const OFFSET = "arc-rot-v1";
const DONE = "arc-rot-done-v1";
const REFLECT = "arc-reflect-v1";

export function dayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

export function slotOf(date = new Date()): RoutineSlot {
  const hour = date.getHours();
  if (hour < 11) return "morgen";
  if (hour < 17) return "tag";
  return "abend";
}

export function slotLabel(slot: RoutineSlot) {
  if (slot === "morgen") return "Morgen";
  if (slot === "tag") return "Tag";
  return "Abend";
}

function readOffset() {
  if (typeof localStorage === "undefined") return 0;
  const value = Number(localStorage.getItem(OFFSET) || "0");
  return Number.isFinite(value) ? value : 0;
}

function readCustom(): { slot: RoutineSlot; text: string }[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as { slot?: unknown; text?: unknown };
        const slot: RoutineSlot = item.slot === "morgen" || item.slot === "abend" ? item.slot : "tag";
        const text = typeof item.text === "string" ? item.text.trim().slice(0, 140) : "";
        return text ? { slot, text } : null;
      })
      .filter((item): item is { slot: RoutineSlot; text: string } => !!item)
      .slice(0, 24);
  } catch {
    return [];
  }
}

export function bankFor(slot: RoutineSlot) {
  return [...LINES[slot], ...readCustom().filter((item) => item.slot === slot).map((item) => item.text)];
}

export function currentLine(date = new Date()) {
  const slot = slotOf(date);
  const bank = bankFor(slot);
  return bank[(dayOfYear(date) + readOffset()) % bank.length] || LINES[slot][0];
}

export function rotateLine(date = new Date()) {
  const slot = slotOf(date);
  const next = readOffset() + 1;
  localStorage.setItem(OFFSET, String(next));
  window.dispatchEvent(new Event("arc-routine"));
  return currentLine(date) || LINES[slot][0];
}

export function addRoutineLine(slot: RoutineSlot, text: string) {
  const clean = text.trim().slice(0, 140);
  if (!clean) return;
  const next = [...readCustom(), { slot, text: clean }].slice(-24);
  localStorage.setItem(CUSTOM, JSON.stringify(next));
  window.dispatchEvent(new Event("arc-routine"));
}

export function pinRoutine(text: string, date = new Date()) {
  const slot = slotOf(date);
  const clean = text.trim().slice(0, 140);
  if (!clean) return;
  if (!readCustom().some((item) => item.slot === slot && item.text === clean)) addRoutineLine(slot, clean);
  const bank = bankFor(slot);
  const index = bank.lastIndexOf(clean);
  if (index < 0) return;
  const span = bank.length;
  const offset = (index - (dayOfYear(date) % span) + span) % span;
  localStorage.setItem(OFFSET, String(offset));
  window.dispatchEvent(new Event("arc-routine"));
}

export function lineDone(date = new Date()) {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DONE) === `${dayKey(date)}:${currentLine(date)}`;
}

export function markLine(done: boolean, date = new Date()) {
  if (done) localStorage.setItem(DONE, `${dayKey(date)}:${currentLine(date)}`);
  else localStorage.removeItem(DONE);
  window.dispatchEvent(new Event("arc-routine"));
}

export function exportRoutine() {
  let reflections: Record<string, Reflection> = {};
  try {
    reflections = JSON.parse(readKept(REFLECT) || "{}") as Record<string, Reflection>;
  } catch {
    reflections = {};
  }
  return { custom: readCustom(), offset: readOffset(), reflections };
}

export function importRoutine(value: unknown) {
  if (!value || typeof value !== "object") return;
  const row = value as { custom?: unknown; offset?: unknown; reflections?: unknown };
  if (Array.isArray(row.custom)) {
    const custom = row.custom
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const line = item as { slot?: unknown; text?: unknown };
        const slot = line.slot === "morgen" || line.slot === "abend" || line.slot === "tag" ? line.slot : null;
        const text = typeof line.text === "string" ? line.text.trim().slice(0, 140) : "";
        return slot && text ? { slot, text } : null;
      })
      .filter((item): item is { slot: RoutineSlot; text: string } => !!item)
      .slice(0, 24);
    const merged = [...readCustom()];
    for (const item of custom) {
      if (!merged.some((have) => have.slot === item.slot && have.text === item.text)) merged.push(item);
    }
    localStorage.setItem(CUSTOM, JSON.stringify(merged.slice(-24)));
  }
  if (typeof row.offset === "number" && Number.isFinite(row.offset)) {
    localStorage.setItem(OFFSET, String(Math.max(readOffset(), Math.floor(row.offset))));
  }
  if (row.reflections && typeof row.reflections === "object") {
    const current = exportRoutine().reflections;
    const incoming = row.reflections as Record<string, Reflection>;
    for (const [key, item] of Object.entries(incoming)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !item) continue;
      const prev = current[key] ?? { did: "", stuck: "", next: "" };
      current[key] = {
        did: prev.did || String(item.did || "").slice(0, 240),
        stuck: prev.stuck || String(item.stuck || "").slice(0, 240),
        next: prev.next || String(item.next || "").slice(0, 240),
      };
    }
    const keys = Object.keys(current).sort().slice(-14);
    const kept: Record<string, Reflection> = {};
    for (const key of keys) {
      const item = current[key];
      if (item) kept[key] = item;
    }
    keepSoon(REFLECT, JSON.stringify(kept));
  }
  window.dispatchEvent(new Event("arc-routine"));
}

export function loadReflection(date = new Date()): Reflection {
  const empty = { did: "", stuck: "", next: "" };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = JSON.parse(readKept(REFLECT) || "{}") as Record<string, Reflection>;
    const row = raw[dayKey(date)];
    if (!row) return empty;
    return {
      did: String(row.did || "").slice(0, 240),
      stuck: String(row.stuck || "").slice(0, 240),
      next: String(row.next || "").slice(0, 240),
    };
  } catch {
    return empty;
  }
}

export function saveReflection(next: Reflection, date = new Date(), quiet = false) {
  let raw: Record<string, Reflection> = {};
  try {
    raw = JSON.parse(readKept(REFLECT) || "{}") as Record<string, Reflection>;
  } catch {
    raw = {};
  }
  raw[dayKey(date)] = {
    did: next.did.slice(0, 240),
    stuck: next.stuck.slice(0, 240),
    next: next.next.slice(0, 240),
  };
  const keys = Object.keys(raw).sort().slice(-14);
  const kept: Record<string, Reflection> = {};
  for (const key of keys) {
    const row = raw[key];
    if (row) kept[key] = row;
  }
  keepSoon(REFLECT, JSON.stringify(kept));
  if (!quiet) window.dispatchEvent(new Event("arc-routine"));
}
