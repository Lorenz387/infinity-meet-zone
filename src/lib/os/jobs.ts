import { useEffect, useState } from "react";
import { cleanRoom, plainJob } from "@/lib/os/guard";
import { keepNow, readKept } from "@/lib/os/keep";

export type JobKind = "web" | "film" | "event" | "laden" | "dienst";
export type JobStatus = "offen" | "läuft" | "fertig";

export type Crew = { name: string; role: string };
export type SignOff = { by: string; text: string; at: number };

export type Job = {
  id: string;
  client: string;
  kind: JobKind;
  line: string;
  status: JobStatus;
  room: string;
  rooms: string[];
  at: number;
  when: string;
  place: string;
  crew: Crew[];
  sign: SignOff | null;
  touch?: JobTouch;
};

type JobField = "status" | "when" | "place" | "line" | "crew" | "sign" | "client" | "kind";
export type JobTouch = Partial<Record<JobField, number>>;

const KEY = "arc-jobs-v1";

export const JOB_KINDS: { id: JobKind; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "film", label: "Film" },
  { id: "event", label: "Event" },
  { id: "laden", label: "Laden" },
  { id: "dienst", label: "Dienst" },
];

export function kindLabel(kind: JobKind) {
  return JOB_KINDS.find((item) => item.id === kind)?.label ?? "Dienst";
}

export function isJobKind(value: string): value is JobKind {
  return JOB_KINDS.some((item) => item.id === value);
}

export function briefFor(job: Job) {
  const live = job.kind === "film" || job.kind === "event";
  const ask = live
    ? "Drei kurze Zeilen, nichts erfunden: was live passiert, wer liefert, der nächste Schritt."
    : "Drei kurze Zeilen, nichts erfunden: was der Auftrag ist, was geliefert wird, der nächste Schritt.";
  return `Laufzettel für ${job.client}, ${kindLabel(job.kind)}. ${ask} Ausgang: ${job.line || "noch offen"}.`;
}

function asWhen(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function fieldAt(job: Job): Record<JobField, number> {
  const base = typeof job.at === "number" ? job.at : 0;
  const touch = job.touch ?? {};
  return {
    status: touch.status ?? base,
    when: touch.when ?? base,
    place: touch.place ?? base,
    line: touch.line ?? base,
    crew: touch.crew ?? base,
    sign: touch.sign ?? base,
    client: touch.client ?? base,
    kind: touch.kind ?? base,
  };
}

function stamped(job: Job, field: JobField, now = Date.now()): Job {
  const touch = fieldAt(job);
  touch[field] = now;
  return { ...job, at: Math.max(job.at, now), touch };
}

function asJob(value: unknown): Job | null {
  const job = plainJob(value);
  return job ? { ...job, kind: job.kind as JobKind, status: job.status as JobStatus } : null;
}

function readJobs(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(readKept(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(asJob).filter((job): job is Job => !!job).slice(0, 12);
  } catch {
    return [];
  }
}

function writeJobs(jobs: Job[]) {
  keepNow(KEY, JSON.stringify(jobs.slice(0, 12)));
  window.dispatchEvent(new Event("arc-jobs"));
}

export function addJob(input: { client: string; kind: JobKind; line: string; room: string }): Job {
  const at = Date.now();
  const job: Job = {
    id: `job-${at.toString(36)}`,
    client: input.client.trim().slice(0, 40),
    kind: input.kind,
    line: input.line.trim().slice(0, 160),
    status: "offen",
    room: input.room,
    rooms: [],
    at,
    when: "",
    place: "",
    crew: [],
    sign: null,
    touch: { status: at, when: at, place: at, line: at, crew: at, sign: at, client: at, kind: at },
  };
  writeJobs([job, ...readJobs().filter((item) => item.room !== job.room)].slice(0, 12));
  return job;
}

export function attachRoom(id: string, raw: string) {
  const room = cleanRoom(raw);
  const job = readJobs().find((item) => item.id === id);
  if (!job || room.length < 4 || room === job.room || job.rooms.includes(room) || job.rooms.length >= 4) return false;
  writeJobs(readJobs().map((item) => (item.id === id ? { ...item, rooms: [...item.rooms, room] } : item)));
  return true;
}

export function detachRoom(id: string, room: string) {
  writeJobs(readJobs().map((job) => (job.id === id ? { ...job, rooms: job.rooms.filter((item) => item !== room) } : job)));
}

export function setJobStatus(id: string, status: JobStatus) {
  writeJobs(readJobs().map((job) => (job.id === id ? stamped({ ...job, status }, "status") : job)));
}

export function forgetJob(id: string) {
  writeJobs(readJobs().filter((job) => job.id !== id));
}

export function patchJob(id: string, partial: { when?: string; place?: string }) {
  writeJobs(
    readJobs().map((job) => {
      if (job.id !== id) return job;
      let next: Job = {
        ...job,
        ...(partial.when !== undefined ? { when: asWhen(partial.when) } : {}),
        ...(partial.place !== undefined ? { place: partial.place.trim().slice(0, 48) } : {}),
      };
      const now = Date.now();
      if (partial.when !== undefined) next = stamped(next, "when", now);
      if (partial.place !== undefined) next = stamped(next, "place", now);
      return next;
    }),
  );
}

export function addCrew(id: string, name: string, role: string) {
  const clean = name.trim().slice(0, 32);
  if (!clean) return;
  writeJobs(
    readJobs().map((job) =>
      job.id === id ? stamped({ ...job, crew: [...job.crew, { name: clean, role: role.trim().slice(0, 32) }].slice(-8) }, "crew") : job,
    ),
  );
}

export function dropCrew(id: string, index: number) {
  writeJobs(readJobs().map((job) => (job.id === id ? stamped({ ...job, crew: job.crew.filter((_, at) => at !== index) }, "crew") : job)));
}

export function signJob(id: string, by: string, text: string) {
  const clean = text.trim().slice(0, 80);
  if (!clean) return;
  const sign: SignOff = { by: by.trim().slice(0, 40) || "Du", text: clean, at: Date.now() };
  writeJobs(readJobs().map((job) => (job.id === id ? stamped({ ...job, sign }, "sign") : job)));
}

export function clearSign(id: string) {
  writeJobs(readJobs().map((job) => (job.id === id ? stamped({ ...job, sign: null }, "sign") : job)));
}

export function minutesOf(when: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(when);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function byWhen(a: Job, b: Job): number {
  const left = minutesOf(a.when);
  const right = minutesOf(b.when);
  if (left === null && right === null) return a.at - b.at;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

export function nextSlot(jobs: Job[], now = new Date()): Job | null {
  const minute = now.getHours() * 60 + now.getMinutes();
  const timed = jobs.filter((job) => job.status !== "fertig" && minutesOf(job.when) !== null);
  const upcoming = timed.filter((job) => (minutesOf(job.when) ?? 0) >= minute).sort(byWhen);
  if (upcoming[0]) return upcoming[0];
  return timed.sort((a, b) => (minutesOf(b.when) ?? 0) - (minutesOf(a.when) ?? 0))[0] ?? null;
}

export function handoffText(jobs: Job[]): string {
  if (!jobs.length) return "";
  const lines = [...jobs].sort(byWhen).map((job) => {
    const bits = [job.when || "ohne Zeit", kindLabel(job.kind), job.client, job.status];
    if (job.place) bits.push(job.place);
    if (job.crew[0]) bits.push(`${job.crew[0].name}${job.crew[0].role ? ` ${job.crew[0].role}` : ""}`);
    if (job.sign) bits.push(`frei: ${job.sign.text}`);
    return bits.join(" ");
  });
  return `Übergabe. ${lines.join(". ")}`.slice(0, 420);
}

export function jobsFromUnknown(value: unknown): Job[] {
  if (!Array.isArray(value)) return [];
  return value.map(asJob).filter((job): job is Job => !!job).slice(0, 12);
}

export function exportJobs(): Job[] {
  return readJobs();
}

export function jobForRoom(room: string): Job | null {
  return readJobs().find((job) => job.room === room) ?? null;
}

export function fillJob(prev: Job | undefined, incoming: Job): Job {
  if (!prev) return incoming;
  return {
    ...prev,
    client: prev.client || incoming.client,
    line: prev.line || incoming.line,
    when: prev.when || incoming.when,
    place: prev.place || incoming.place,
    crew: prev.crew.length ? prev.crew : incoming.crew,
    sign: prev.sign ?? incoming.sign,
    rooms: unionRooms(prev.room, prev.rooms, incoming.rooms),
    status: prev.status === "offen" ? incoming.status : prev.status,
  };
}

function mergeJob(prev: Job, incoming: Job): Job {
  const left = fieldAt(prev);
  const right = fieldAt(incoming);
  const pick = <T>(field: JobField, local: T, remote: T): T => (right[field] > left[field] ? remote : local);
  const touch: JobTouch = {
    status: Math.max(left.status, right.status),
    when: Math.max(left.when, right.when),
    place: Math.max(left.place, right.place),
    line: Math.max(left.line, right.line),
    crew: Math.max(left.crew, right.crew),
    sign: Math.max(left.sign, right.sign),
    client: Math.max(left.client, right.client),
    kind: Math.max(left.kind, right.kind),
  };
  return {
    id: prev.id,
    client: pick("client", prev.client, incoming.client),
    kind: pick("kind", prev.kind, incoming.kind),
    line: pick("line", prev.line, incoming.line),
    status: pick("status", prev.status, incoming.status),
    room: prev.room,
    at: Math.max(prev.at, incoming.at),
    when: pick("when", prev.when, incoming.when),
    place: pick("place", prev.place, incoming.place),
    crew: pick("crew", prev.crew, incoming.crew),
    sign: pick("sign", prev.sign, incoming.sign),
    rooms: unionRooms(prev.room, prev.rooms, incoming.rooms),
    touch,
  };
}

function unionRooms(primary: string, ...lists: string[][]) {
  const rooms: string[] = [];
  for (const list of lists) {
    for (const room of list) {
      if (room.length < 4 || room === primary || rooms.includes(room)) continue;
      rooms.push(room);
      if (rooms.length >= 4) return rooms;
    }
  }
  return rooms;
}

export function importJobs(value: unknown, mode: "fill" | "newer" = "newer"): number {
  const incoming = jobsFromUnknown(value);
  const local = readJobs();
  const byRoom = new Map(local.map((job) => [job.room, job]));
  for (const job of incoming) {
    const prev = byRoom.get(job.room);
    if (mode === "fill") byRoom.set(job.room, fillJob(prev, job));
    else if (!prev) byRoom.set(job.room, job);
    else byRoom.set(job.room, mergeJob(prev, job));
  }
  const next = [...byRoom.values()].sort((a, b) => b.at - a.at).slice(0, 12);
  if (JSON.stringify(next) !== JSON.stringify(local)) writeJobs(next);
  return incoming.length;
}

export function useJobs(): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    const pull = () => setJobs(readJobs());
    pull();
    window.addEventListener("arc-jobs", pull);
    return () => window.removeEventListener("arc-jobs", pull);
  }, []);
  return jobs;
}
