import { useSyncExternalStore } from "react";
import { cleanCode } from "../meet/media.ts";
import { keepNow, readKept } from "./keep.ts";
import { memoryEmpty, type RoomMemory } from "./memory.ts";

export type OpenSession = { room: string; label: string };

const KEY = "arc-sessions-v1";
const MAX = 4;

export function todayRoom(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `tag${now.getFullYear()}${month}${day}`;
}

export type DayTurn = { who: "Du" | "Arcy"; text: string };

export function talkKey(now = new Date()) {
  return `arc-day-talk-${todayRoom(now)}`;
}

export function daySeenKey(now = new Date()) {
  return `arc-day-seen-${todayRoom(now)}`;
}

export function fitTalk(value: unknown): DayTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: DayTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { who?: unknown; text?: unknown };
    const who = row.who === "Du" || row.who === "Arcy" ? row.who : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!who || !text) continue;
    turns.push({ who, text });
  }
  return turns.slice(-8);
}

function bit(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function sessionBrief(label: string, room: string, memory: RoomMemory | null | undefined, others: string) {
  const rows = [`${bit(label) || room} (${room})`, others ? `Personen: ${bit(others)}` : "Personen: noch niemand sonst"];
  if (!memory || memoryEmpty(memory)) {
    rows.push("Gespeichert: nichts.");
    return rows.join("\n");
  }
  if (memory.now) rows.push(`Jetzt: ${bit(memory.now)}`);
  const covered = memory.covered.map((point) => bit(point.title)).filter(Boolean).slice(0, 4);
  if (covered.length) rows.push(`Durchgegangen: ${covered.join(", ")}`);
  const decided = (memory.decided ?? [])
    .map((item) => {
      const title = bit(item.title);
      const by = bit(item.by);
      if (!title) return "";
      return by && by !== "Gast" ? `${title} · ${by}` : title;
    })
    .filter(Boolean)
    .slice(0, 4);
  if (decided.length) rows.push(`Entschieden: ${decided.join(", ")}`);
  const open = memory.tasks
    .filter((task) => !task.done)
    .map((task) => bit(task.title))
    .filter(Boolean)
    .slice(0, 4);
  if (open.length) rows.push(`Offen: ${open.join(", ")}`);
  const last = memory.heard[memory.heard.length - 1];
  if (last?.text) rows.push(`Zuletzt: ${bit(last.name) || "Gast"}: ${bit(last.text)}`);
  if (memory.cue) rows.push(`Satz: ${bit(memory.cue)}`);
  return rows.join("\n");
}

export function learnSpoken(briefs: string[]) {
  if (!briefs.length) return "Keine Sitzung ist offen.";
  return briefs
    .map((block) => {
      const rows = block.split("\n");
      const title = rows[0] || "Sitzung";
      const notable = rows.find((row) => row.startsWith("Zuletzt:") || row.startsWith("Entschieden:") || row.startsWith("Jetzt:") || row.startsWith("Gespeichert:"));
      return notable ? `${title}. ${notable}` : title;
    })
    .join(" ")
    .slice(0, 400);
}

export function fitSessions(value: unknown): OpenSession[] {
  if (!Array.isArray(value)) return [];
  const rooms: OpenSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { room?: unknown; label?: unknown };
    const room = cleanCode(typeof row.room === "string" ? row.room : "");
    if (room.length < 4 || rooms.some((session) => session.room === room)) continue;
    const label = typeof row.label === "string" ? row.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    rooms.push({ room, label: label || room });
    if (rooms.length >= MAX) break;
  }
  return rooms;
}

export function addSession(list: OpenSession[], room: string, label: string) {
  const code = cleanCode(room);
  if (code.length < 4) return { list, error: "Der Code braucht mindestens 4 Zeichen." };
  if (list.some((session) => session.room === code)) return { list, error: "Die Sitzung ist schon offen." };
  if (list.length >= MAX) return { list, error: "Vier Sitzungen sind offen. Schließ eine, bevor eine neue dazu kommt." };
  const name = label.replace(/\s+/g, " ").trim().slice(0, 40) || code;
  return { list: [...list, { room: code, label: name }], error: "" };
}

let cacheRaw = "";
let cacheList: OpenSession[] = [];
const listeners = new Set<() => void>();

export function getSessions() {
  const raw = readKept(KEY) || "[]";
  if (raw === cacheRaw) return cacheList;
  cacheRaw = raw;
  try {
    cacheList = fitSessions(JSON.parse(raw));
  } catch {
    cacheList = [];
  }
  return cacheList;
}

function writeSessions(list: OpenSession[]) {
  const next = fitSessions(list);
  cacheRaw = JSON.stringify(next);
  cacheList = next;
  keepNow(KEY, cacheRaw);
  listeners.forEach((listen) => listen());
}

export function subscribeSessions(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

const EMPTY: OpenSession[] = [];

export function useSessions() {
  return useSyncExternalStore(subscribeSessions, getSessions, () => EMPTY);
}

export function openSession(room: string, label: string) {
  const result = addSession(getSessions(), room, label);
  if (!result.error) writeSessions(result.list);
  return result.error;
}

export function closeSession(room: string) {
  const code = cleanCode(room);
  writeSessions(getSessions().filter((session) => session.room !== code));
}
