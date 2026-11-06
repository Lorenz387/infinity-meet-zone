import { cleanRoom } from "./guard.ts";
import { keepDecision, type MemoryDecision, type MemoryLine, type MemoryPoint, type MemoryTask, type RoomMemory } from "./memory.ts";

export type DossierJob = { client: string; line: string; room: string; rooms?: string[] };

export type Dossier = {
  rooms: string[];
  covered: MemoryPoint[];
  decided: MemoryDecision[];
  people: string[];
  now: string;
  open: MemoryTask[];
  done: MemoryTask[];
  last: MemoryLine | null;
  cue: string;
};

export function jobRooms(job: { room: string; rooms?: string[] }) {
  const primary = cleanRoom(job.room);
  const rooms = primary.length >= 4 ? [primary] : [];
  for (const item of job.rooms ?? []) {
    const room = cleanRoom(item);
    if (room.length < 4 || rooms.includes(room)) continue;
    rooms.push(room);
    if (rooms.length >= 5) break;
  }
  return rooms;
}

const STOCK = new Set(["", "Gast", "Raum", "Vom Schreibtisch.", "Web", "Film", "Event", "Laden", "Dienst"]);

function personName(value: string) {
  const name = value.trim();
  return STOCK.has(name) ? "" : name;
}

export function compileDossier(job: DossierJob, memories: Record<string, RoomMemory | null | undefined>): Dossier {
  const rooms = jobRooms(job);
  const covered: MemoryPoint[] = [];
  const seen = new Set<string>();
  const tasks = new Map<string, MemoryTask>();
  const decided = new Map<string, MemoryDecision>();
  const versions = new Map<string, MemoryDecision[]>();
  const people: string[] = [];
  const seenPeople = new Set<string>();
  let last: MemoryLine | null = null;
  let now = "";
  let nowAt = -1;
  let cue = "";
  let cueAt = -1;
  for (const room of rooms) {
    const memory = memories[room];
    if (!memory) continue;
    for (const point of memory.covered) {
      if (seen.has(point.id)) continue;
      seen.add(point.id);
      covered.push(point);
    }
    let activity = 0;
    for (const task of memory.tasks) {
      activity = Math.max(activity, task.at);
      const prev = tasks.get(task.id);
      if (!prev || task.at >= prev.at) tasks.set(task.id, task);
    }
    for (const line of memory.heard) {
      activity = Math.max(activity, line.at);
      if (!last || line.at >= last.at) last = line;
      const name = personName(line.name);
      if (name && !seenPeople.has(name) && people.length < 8) {
        seenPeople.add(name);
        people.push(name);
      }
    }
    for (const item of memory.decided ?? []) {
      const list = versions.get(item.id) ?? [];
      list.push(item);
      versions.set(item.id, list);
    }
    if (memory.now && activity >= nowAt) {
      now = memory.now;
      nowAt = activity;
    }
    if (memory.cue && activity >= cueAt) {
      cue = memory.cue;
      cueAt = activity;
    }
  }
  for (const [id, items] of versions) {
    const sorted = [...items].sort((a, b) => a.at - b.at);
    let kept: MemoryDecision | undefined;
    for (const item of sorted) kept = keepDecision(kept, item);
    if (kept) decided.set(id, kept);
  }
  const list = [...tasks.values()].sort((a, b) => b.at - a.at);
  for (const task of list) {
    if (!task.done || decided.has(task.id)) continue;
    decided.set(task.id, { id: task.id, title: task.title, by: task.body, at: task.at });
  }
  const decisions = [...decided.values()].sort((a, b) => a.at - b.at).slice(0, 12);
  for (const item of decisions) {
    const name = personName(item.by);
    if (name && !seenPeople.has(name) && people.length < 8) {
      seenPeople.add(name);
      people.push(name);
    }
  }
  return {
    rooms,
    covered: covered.slice(0, 8),
    decided: decisions,
    people,
    now,
    open: list.filter((task) => !task.done).slice(0, 6),
    done: list.filter((task) => task.done).slice(0, 6),
    last,
    cue,
  };
}

function decisionLine(item: MemoryDecision) {
  const by = personName(item.by);
  return by ? `${item.title} · ${by}` : item.title;
}

export function dossierText(job: { client: string; line: string }, dossier: Dossier) {
  const lines = [
    `Auftrag: ${job.client}`,
    job.line ? `Arbeit: ${job.line}` : "",
    dossier.rooms.length ? `Räume: ${dossier.rooms.join(", ")}` : "",
    dossier.now ? `Jetzt: ${dossier.now}` : "",
    dossier.covered.length ? `Durchgegangen: ${dossier.covered.map((point) => point.title).join(", ")}` : "",
    dossier.decided.length ? `Entschieden: ${dossier.decided.map(decisionLine).join(", ")}` : "",
    dossier.people.length ? `Dabei: ${dossier.people.join(", ")}` : "",
    dossier.open.length ? `Offen: ${dossier.open.map((task) => task.title).join(", ")}` : "",
    dossier.done.length ? `Erledigt: ${dossier.done.map((task) => task.title).join(", ")}` : "",
    dossier.last ? `Zuletzt: ${dossier.last.name}: ${dossier.last.text}` : "",
    dossier.cue ? `Satz: ${dossier.cue}` : "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}
