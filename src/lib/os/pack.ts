import { loadProfile, saveProfile, type ArcyProfile, type ArcyTone } from "@/lib/os/arcy";
import { fitMemory } from "@/lib/os/guard";
import { keepNow, readKept } from "@/lib/os/keep";
import { seedMemory } from "@/lib/os/memory-sync";
import { memoryEmpty, type RoomMemory } from "@/lib/os/memory";
import { fitSessions, fitTalk, getSessions, openSession, talkKey, todayRoom, type DayTurn, type OpenSession } from "@/lib/os/sessions";
import { getCue, setCue } from "@/lib/os/cue";
import { exportNotes, importNotes } from "@/lib/os/desk";
import { blobOf, listFiles, putFile } from "@/lib/os/files";
import { exportJobs, importJobs, jobForRoom, jobsFromUnknown } from "@/lib/os/jobs";
import { applyLook, loadLook, type OsScale } from "@/lib/os/look";
import { loadPageUrl, savePageUrl } from "@/lib/os/page";
import { exportRoutine, importRoutine } from "@/lib/os/routine";
import { applySharedCard, applySharedLine, importSheets, readSheets, sheetsFromUnknown } from "@/lib/os/sheets";
import type { SheetCard } from "@/lib/os/types";
import { exportThoughts, importThoughts } from "@/lib/os/thoughts";
import { exportFlows, importFlows } from "@/lib/os/workflows";
import { packText as writePack } from "@/lib/os/pack-text";

export type ArcPack = {
  v: 1;
  at: number;
  profile: ArcyProfile;
  look: { scale: OsScale; contrast: boolean };
  jobs: unknown[];
  sheets: unknown[];
  notes: { text: string; at: number }[];
  routine: unknown;
  page: string;
  thoughts: unknown[];
  flows: unknown[];
  files: { name: string; type: string; data: string }[];
  skipped: string[];
  rooms: { room: string; memory: RoomMemory }[];
  sessions: OpenSession[];
  talk: DayTurn[];
};

const FILE_CHARS = 2_000_000;
const PACK_CHARS = 6_000_000;

function tone(value: unknown): ArcyTone {
  return value === "ruhig" || value === "direkt" ? value : "knapp";
}

function cardOf(value: unknown): SheetCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SheetCard;
  if (typeof row.id !== "string") return null;
  if (row.kind === "task" && typeof row.title === "string") return { ...row, title: row.title.slice(0, 140), body: typeof row.body === "string" ? row.body.slice(0, 280) : "" };
  if (row.kind === "note" && typeof row.text === "string") return { ...row, text: row.text.slice(0, 500) };
  if (row.kind === "mail" && typeof row.subject === "string") return { ...row, subject: row.subject.slice(0, 120), body: typeof row.body === "string" ? row.body.slice(0, 500) : "" };
  return null;
}

async function asBase64(blob: Blob) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return data;
}

function roomCodes() {
  const codes = new Set<string>();
  for (const job of exportJobs()) {
    if (job.room) codes.add(job.room);
    for (const extra of job.rooms) if (extra) codes.add(extra);
  }
  for (const sheet of readSheets()) if (sheet.room) codes.add(sheet.room);
  for (const session of getSessions()) codes.add(session.room);
  codes.add(todayRoom());
  return [...codes].filter((code) => code.length >= 4).slice(0, 24);
}

async function pullRoom(room: string): Promise<RoomMemory | null> {
  try {
    const res = await fetch(`/api/memory?room=${encodeURIComponent(room)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { memory?: unknown };
    return fitMemory(data.memory);
  } catch {
    return null;
  }
}

async function collectRooms() {
  const rooms: { room: string; memory: RoomMemory }[] = [];
  for (const room of roomCodes()) {
    const memory = await pullRoom(room);
    if (!memory || memoryEmpty(memory)) continue;
    rooms.push({ room, memory });
  }
  return rooms;
}

function fitRooms(value: unknown[]) {
  const rooms: { room: string; memory: RoomMemory }[] = [];
  for (const item of value.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const row = item as { room?: unknown; memory?: unknown };
    const room = typeof row.room === "string" ? row.room : "";
    const memory = fitMemory(row.memory);
    if (room.length < 4 || !memory) continue;
    rooms.push({ room, memory });
  }
  return rooms;
}

function savedTalk() {
  try {
    return fitTalk(JSON.parse(readKept(talkKey()) || "[]"));
  } catch {
    return [];
  }
}

export async function buildPack(): Promise<ArcPack> {
  const look = loadLook();
  const files: ArcPack["files"] = [];
  const skipped: string[] = [];
  let budget = PACK_CHARS;
  try {
    for (const file of await listFiles()) {
      const blob = await blobOf(file.id);
      if (!blob || blob.size * 1.4 > FILE_CHARS) {
        skipped.push(file.name);
        continue;
      }
      const data = await asBase64(blob);
      if (!data || data.length > FILE_CHARS || data.length > budget) {
        skipped.push(file.name);
        continue;
      }
      budget -= data.length;
      files.push({ name: file.name, type: file.type, data });
    }
  } catch {
    skipped.push("Ablage");
  }
  return {
    v: 1,
    at: Date.now(),
    profile: loadProfile(),
    look: { scale: look.scale, contrast: look.contrast },
    jobs: exportJobs(),
    sheets: readSheets(),
    notes: exportNotes().map((note) => ({ text: note.text, at: note.at })),
    routine: exportRoutine(),
    page: loadPageUrl(),
    thoughts: exportThoughts(),
    flows: exportFlows(),
    files,
    skipped,
    rooms: await collectRooms(),
    sessions: getSessions(),
    talk: savedTalk(),
  };
}

export function parsePack(raw: string): ArcPack | null {
  try {
    const data = JSON.parse(raw) as Partial<ArcPack>;
    if (data.v !== 1 || !data.profile || typeof data.profile !== "object") return null;
    const profile = data.profile as Partial<ArcyProfile>;
    const look = data.look && typeof data.look === "object" ? data.look : { scale: "base" as const, contrast: false };
    const scale: OsScale = look.scale === "read" || look.scale === "large" ? look.scale : "base";
    const files = Array.isArray(data.files)
      ? data.files
          .filter((file) => file && typeof file.name === "string" && typeof file.data === "string" && file.data.length <= FILE_CHARS)
          .slice(0, 16)
          .map((file) => ({ name: file.name.slice(0, 80), type: typeof file.type === "string" ? file.type : "application/octet-stream", data: file.data }))
      : [];
    return {
      v: 1,
      at: typeof data.at === "number" ? data.at : Date.now(),
      profile: { address: String(profile.address || "").slice(0, 40), tone: tone(profile.tone), note: String(profile.note || "").slice(0, 400) },
      look: { scale, contrast: Boolean(look.contrast) },
      jobs: Array.isArray(data.jobs) ? data.jobs.slice(0, 12) : [],
      sheets: Array.isArray(data.sheets) ? data.sheets.slice(0, 24) : [],
      notes: Array.isArray(data.notes) ? data.notes.slice(0, 12) : [],
      routine: data.routine ?? {},
      page: typeof data.page === "string" ? data.page : "",
      thoughts: Array.isArray(data.thoughts) ? data.thoughts.slice(0, 40) : [],
      flows: Array.isArray(data.flows) ? data.flows.slice(0, 8) : [],
      files,
      skipped: Array.isArray(data.skipped) ? data.skipped.filter((item) => typeof item === "string").slice(0, 16) : [],
      rooms: Array.isArray(data.rooms) ? fitRooms(data.rooms) : [],
      sessions: Array.isArray(data.sessions) ? fitSessions(data.sessions) : [],
      talk: fitTalk(data.talk),
    };
  } catch {
    return null;
  }
}

export function packSummary(pack: ArcPack) {
  const jobs = jobsFromUnknown(pack.jobs).length;
  const sheets = sheetsFromUnknown(pack.sheets).length;
  const notes = pack.notes.length;
  const files = pack.files.length;
  const thoughts = Array.isArray(pack.thoughts) ? pack.thoughts.length : 0;
  const flows = Array.isArray(pack.flows) ? pack.flows.length : 0;
  const rooms = pack.rooms.length;
  return `${jobs} Aufträge, ${sheets} Protokolle, ${notes} Zettel, ${files} Dateien${rooms ? `, ${rooms} Akten` : ""}${thoughts ? `, ${thoughts} Gedanken` : ""}${flows ? `, ${flows} Workflows` : ""}`;
}

export async function applyPack(pack: ArcPack) {
  saveProfile(pack.profile);
  applyLook({ ...loadLook(), scale: pack.look.scale, contrast: pack.look.contrast });
  const jobs = importJobs(pack.jobs, "newer");
  const sheets = importSheets(pack.sheets);
  const notes = importNotes(pack.notes);
  importRoutine(pack.routine);
  if (pack.page) savePageUrl(pack.page);
  const thoughts = importThoughts(pack.thoughts);
  const flows = importFlows(pack.flows);
  let files = 0;
  const present = await listFiles().catch(() => []);
  for (const file of pack.files) {
    if (present.some((item) => item.name === file.name && item.size === Math.floor((file.data.length * 3) / 4))) continue;
    const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
    const result = await putFile(new File([bytes], file.name, { type: file.type }));
    if (result.ok) files += 1;
  }
  let rooms = 0;
  for (const room of pack.rooms) {
    try {
      await seedMemory(room.room, room.memory);
      rooms += 1;
    } catch {
      // The desk is already back. A room that does not answer stays in the file.
    }
  }
  for (const session of pack.sessions) openSession(session.room, session.label);
  if (pack.talk.length) keepNow(talkKey(), JSON.stringify(pack.talk));
  return `Eingeklinkt: ${jobs} Aufträge, ${sheets} Protokolle, ${notes} neue Zettel, ${files} Dateien${rooms ? `, ${rooms} Akten` : ""}${thoughts ? `, ${thoughts} Gedanken` : ""}${flows ? `, ${flows} Workflows` : ""}.`;
}

export function packText(pack: ArcPack) {
  const jobs = jobsFromUnknown(pack.jobs).map((job) => ({ client: job.client, room: job.room, line: job.line }));
  return writePack({ at: pack.at, jobs, sessions: pack.sessions, rooms: pack.rooms, talk: pack.talk });
}

function saveFile(name: string, body: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([body], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadExport() {
  const pack = await buildPack();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `infinity-meet-zone-export-${stamp}.json`;
  const body = JSON.stringify({ ...pack, text: packText(pack) }, null, 2);
  saveFile(name, body, "application/json");
  const stored = await putFile(new File([body], name, { type: "application/json" })).catch(() => ({ ok: false as const, error: "Die Ablage ist nicht erreichbar." }));
  const where = stored.ok ? "Sie liegt in der Ablage und wurde heruntergeladen." : stored.error;
  const extra = pack.skipped.length ? ` ${pack.skipped.length} große Dateien bleiben auf diesem Rechner.` : "";
  return `${name}. ${where} ${packSummary(pack)}.${extra}`;
}

export type SessionBrief = {
  room: string;
  title: string;
  heard: { id: string; name: string; text: string }[];
  cards: SheetCard[];
  job: unknown;
  cue: string;
};

export function sessionBrief(room: string): SessionBrief {
  const sheet = readSheets().find((item) => item.room === room && !item.pinUntil);
  return {
    room,
    title: sheet?.title || "",
    heard: (sheet?.heard ?? []).slice(-8).map((line) => ({ id: line.id, name: line.name, text: line.text })),
    cards: (sheet?.cards ?? []).map(cardOf).filter((card): card is SheetCard => !!card).slice(0, 12),
    job: jobForRoom(room),
    cue: getCue(),
  };
}

export function applyBrief(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const brief = value as Partial<SessionBrief>;
  if (typeof brief.room !== "string" || brief.room.length < 4) return null;
  const room = brief.room;
  const local = readSheets().find((item) => item.room === room);
  let changed = false;
  if (Array.isArray(brief.heard)) {
    for (const line of brief.heard) {
      if (!line || typeof line.id !== "string" || typeof line.text !== "string") continue;
      if (local?.heard.some((item) => item.id === line.id)) continue;
      applySharedLine(room, { id: line.id.slice(0, 40), name: typeof line.name === "string" ? line.name.slice(0, 32) : "Gast", text: line.text.slice(0, 240) });
      changed = true;
    }
  }
  if (Array.isArray(brief.cards)) {
    for (const card of brief.cards) {
      const clean = cardOf(card);
      if (!clean || local?.cards.some((item) => item.id === clean.id)) continue;
      applySharedCard(room, clean);
      changed = true;
    }
  }
  const before = jobForRoom(room);
  importJobs(brief.job ? [brief.job] : [], "fill");
  const after = jobForRoom(room);
  if (!before && after) changed = true;
  if (typeof brief.cue === "string" && brief.cue.trim() && !getCue()) {
    setCue(brief.cue);
    changed = true;
  }
  if (!changed) return null;
  return (typeof brief.title === "string" && brief.title) || after?.client || room;
}
