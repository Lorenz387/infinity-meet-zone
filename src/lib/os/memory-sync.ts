import { readAgenda } from "@/lib/os/agenda";
import { getCue, setCue } from "@/lib/os/cue";
import { fitMemory } from "@/lib/os/guard";
import { jobForRoom } from "@/lib/os/jobs";
import { keepNow, readKept } from "@/lib/os/keep";
import { loadRoom } from "@/lib/meet/room-log";
import { cleanCode, cleanName } from "@/lib/meet/media";
import { EMPTY_MEMORY, mergeMemory, noteGate, type RoomMemory } from "@/lib/os/memory";
import { applySharedCard, applySharedLine, readSheets } from "@/lib/os/sheets";

const KEY = "arc-memory-v1";

function readLocal(room: string): RoomMemory {
  if (typeof window === "undefined") return EMPTY_MEMORY;
  try {
    const raw = JSON.parse(readKept(KEY) || "{}") as unknown;
    if (!raw || typeof raw !== "object") return EMPTY_MEMORY;
    return fitMemory((raw as Record<string, unknown>)[room]) ?? EMPTY_MEMORY;
  } catch {
    return EMPTY_MEMORY;
  }
}

function writeLocal(room: string, memory: RoomMemory) {
  if (typeof window === "undefined") return;
  let book: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(readKept(KEY) || "{}") as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) book = raw as Record<string, unknown>;
  } catch {
    book = {};
  }
  book[room] = memory;
  const rooms = Object.keys(book);
  if (rooms.length > 12) {
    for (const extra of rooms.slice(0, rooms.length - 12)) delete book[extra];
  }
  keepNow(KEY, JSON.stringify(book));
}

export function collectMemory(room: string): RoomMemory | null {
  const code = cleanCode(room);
  if (code.length < 4) return null;
  const sheet = readSheets().find((item) => item.id === `live:${code}`) ?? readSheets().find((item) => item.room === code && !item.pinUntil);
  const agenda = readAgenda(code);
  const job = jobForRoom(code);
  const saved = loadRoom(code);
  const heard = [
    ...(sheet?.heard ?? []).map((line) => ({ id: line.id, name: line.name, text: line.text, at: line.at })),
    ...saved.captions.map((line) => ({ id: line.id, name: line.name, text: line.text, at: line.at })),
  ];
  const tasks = (sheet?.cards ?? [])
    .filter((card) => card.kind === "task")
    .map((card) => ({ id: card.id, title: card.title, body: card.body, done: card.done === true, at: card.at }));
  const draft = {
    heard,
    tasks,
    covered: agenda.points.slice(0, agenda.index).map((point) => ({ id: point.id, title: point.title })),
    decided: tasks.filter((task) => task.done).map((task) => ({ id: task.id, title: task.title, by: task.body, at: task.at })),
    now: agenda.points[agenda.index]?.title ?? "",
    cue: getCue(),
    job: job ? `${job.client}${job.line ? `: ${job.line}` : ""}` : "",
    begun: agenda.startedAt != null,
  };
  return fitMemory(mergeMemory(readLocal(code), fitMemory(draft) ?? EMPTY_MEMORY));
}

function applyMemory(room: string, memory: RoomMemory) {
  const sheet = readSheets().find((item) => item.id === `live:${room}`);
  for (const line of memory.heard) {
    if (sheet?.heard.some((item) => item.id === line.id)) continue;
    applySharedLine(room, { id: line.id, name: line.name || "Gast", text: line.text });
  }
  for (const task of memory.tasks) {
    const current = sheet?.cards.find((card) => card.id === task.id);
    if (current?.kind === "task" && Boolean(current.done) === task.done && current.title === task.title) continue;
    applySharedCard(room, { id: task.id, at: task.at, kind: "task", title: task.title, body: task.body, done: task.done });
  }
  if (memory.cue && !getCue()) setCue(memory.cue);
}

export async function pullMemory(room: string): Promise<RoomMemory> {
  const code = cleanCode(room);
  const local = collectMemory(code) ?? EMPTY_MEMORY;
  if (code.length < 4) return local;
  try {
    const res = await fetch(`/api/memory?room=${code}`);
    if (!res.ok) return local;
    const data = (await res.json()) as { memory?: unknown };
    const remote = fitMemory(data.memory) ?? EMPTY_MEMORY;
    applyMemory(code, remote);
    const merged = mergeMemory(remote, collectMemory(code) ?? EMPTY_MEMORY);
    writeLocal(code, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function readRoomMemory(room: string): Promise<RoomMemory | null> {
  const code = cleanCode(room);
  if (code.length < 4) return null;
  try {
    const res = await fetch(`/api/memory?room=${code}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { memory?: unknown };
    return fitMemory(data.memory);
  } catch {
    return null;
  }
}

export async function seedMemory(room: string, memory: RoomMemory) {
  const code = cleanCode(room);
  const body = fitMemory(memory);
  if (!body || code.length < 4) return;
  try {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room: code, memory: body }),
    });
  } catch {
    // The desk still shows what this browser already holds.
  }
}

const sent = new Map<string, string>();

export async function pushMemory(room: string): Promise<RoomMemory | null> {
  const code = cleanCode(room);
  const body = collectMemory(code);
  if (!body || code.length < 4) return null;
  const raw = JSON.stringify(body);
  if (sent.get(code) === raw) return body;
  try {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room: code, memory: body }),
    });
    if (!res.ok) return body;
    const data = (await res.json()) as { memory?: unknown };
    const merged = fitMemory(data.memory);
    sent.set(code, raw);
    if (merged) {
      const next = mergeMemory(body, merged);
      writeLocal(code, next);
      return next;
    }
    writeLocal(code, body);
    return body;
  } catch {
    return body;
  }
}

export async function leaveNote(room: string, name: string, text: string): Promise<{ note: string; memory: RoomMemory | null }> {
  const blocked = noteGate(name, text);
  const code = cleanCode(room);
  if (blocked || code.length < 4) return { note: blocked || "Der Raum fehlt.", memory: null };
  applySharedLine(code, { id: `note-${Date.now().toString(36)}`, name: cleanName(name), text: text.trim().slice(0, 240) });
  const memory = await pushMemory(code);
  return { note: memory ? "" : "Die Zeile blieb auf diesem Rechner.", memory };
}
