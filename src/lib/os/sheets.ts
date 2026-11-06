import { useEffect, useState } from "react";
import type { ProtocolSheet, SheetCard } from "@/lib/os/types";
import { cleanCode } from "@/lib/meet/media";
import { THEME } from "@/lib/os/theme";
import { plainSheet } from "@/lib/os/guard";
import { keepNow, readKept } from "@/lib/os/keep";

const KEY = "arc-sheets-v1";

function empty(room: string): ProtocolSheet {
  return {
    id: `live:${room}`,
    room,
    title: `${THEME} ${room}`,
    updatedAt: Date.now(),
    pinUntil: null,
    heard: [],
    cards: [],
  };
}

function asSheet(value: unknown): ProtocolSheet | null {
  const plain = plainSheet(value);
  if (!plain) return null;
  return {
    ...plain,
    title: plain.title && !/^Runde /.test(plain.title) ? plain.title : `${THEME} ${plain.room}`,
    cards: plain.cards as SheetCard[],
  };
}

export function readSheets(): ProtocolSheet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(readKept(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw
      .map(asSheet)
      .filter((sheet): sheet is ProtocolSheet => !!sheet)
      .filter((sheet) => sheet.pinUntil === null || sheet.pinUntil > now);
  } catch {
    return [];
  }
}

function writeSheets(sheets: ProtocolSheet[]) {
  keepNow(KEY, JSON.stringify(sheets.slice(0, 24)));
  window.dispatchEvent(new Event("arc-sheets"));
}

export function sheetsFromUnknown(value: unknown): ProtocolSheet[] {
  if (!Array.isArray(value)) return [];
  return value.map(asSheet).filter((sheet): sheet is ProtocolSheet => !!sheet).slice(0, 24);
}

function byId<T extends { id: string }>(left: T[], right: T[]): T[] {
  const seen = new Set(left.map((item) => item.id));
  return [...left, ...right.filter((item) => !seen.has(item.id))];
}

export function importSheets(value: unknown): number {
  const incoming = sheetsFromUnknown(value);
  const map = new Map(readSheets().map((sheet) => [sheet.id, sheet]));
  for (const sheet of incoming) {
    const prev = map.get(sheet.id);
    if (!prev) {
      map.set(sheet.id, sheet);
      continue;
    }
    const newer = sheet.updatedAt > prev.updatedAt ? sheet : prev;
    const older = newer === sheet ? prev : sheet;
    map.set(sheet.id, {
      ...newer,
      pinUntil: prev.pinUntil ?? sheet.pinUntil,
      heard: byId(older.heard, newer.heard).slice(-8),
      cards: byId(newer.cards, older.cards).slice(0, 40),
    });
  }
  writeSheets([...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 24));
  return incoming.length;
}

export function subscribeSheets(onChange: () => void) {
  window.addEventListener("arc-sheets", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("arc-sheets", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSheets(): ProtocolSheet[] {
  const [sheets, setSheets] = useState<ProtocolSheet[]>([]);
  useEffect(() => {
    const pull = () => setSheets(readSheets());
    pull();
    return subscribeSheets(pull);
  }, []);
  return sheets;
}

export function updateLive(room: string, mutate: (sheet: ProtocolSheet) => ProtocolSheet) {
  const all = readSheets();
  const id = `live:${room}`;
  const current = all.find((sheet) => sheet.id === id) ?? empty(room);
  const mutated = mutate(current);
  const unchanged =
    all.some((sheet) => sheet.id === id) &&
    mutated.heard === current.heard &&
    mutated.cards === current.cards &&
    mutated.title === current.title;
  if (unchanged) return current;
  const next = { ...mutated, id, room, updatedAt: Date.now(), pinUntil: null };
  writeSheets([next, ...all.filter((sheet) => sheet.id !== id)]);
  return next;
}

export function pinLive(room: string, days: 1 | 30): ProtocolSheet | null {
  const live = readSheets().find((sheet) => sheet.id === `live:${room}`);
  if (!live || (live.cards.length === 0 && live.heard.length === 0)) return null;
  const copy: ProtocolSheet = {
    ...live,
    id: `pin:${room}:${Date.now()}`,
    pinUntil: Date.now() + days * 86_400_000,
    cards: live.cards.map((card) => ({ ...card })),
    heard: live.heard.map((line) => ({ ...line })),
  };
  writeSheets([copy, ...readSheets()]);
  return copy;
}

export function forgetSheet(id: string) {
  writeSheets(readSheets().filter((sheet) => sheet.id !== id));
}

export function setTaskDone(room: string, id: string, done: boolean) {
  const at = Date.now();
  updateLive(room, (sheet) => ({
    ...sheet,
    cards: sheet.cards.map((card) => (card.kind === "task" && card.id === id && Boolean(card.done) !== done ? { ...card, done, at } : card)),
  }));
}

export function openTaskText(cards: SheetCard[]) {
  const open = cards.filter((card): card is Extract<SheetCard, { kind: "task" }> => card.kind === "task" && !card.done);
  if (!open.length) return "";
  return ["Offene Aufgaben", ...open.map((card) => `- ${card.title}${card.body ? ` — ${card.body}` : ""}`)].join("\n");
}

export function addCard(room: string, card: SheetCard) {
  updateLive(room, (sheet) => ({
    ...sheet,
    cards: [card, ...sheet.cards.filter((item) => item.id !== card.id)].slice(0, 40),
  }));
}

export function startProtocol(title: string, room?: string): ProtocolSheet {
  const label = title.trim().slice(0, 48);
  const given = room ? cleanCode(room) : "";
  const folded = label.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const slug = given.length >= 4 ? given : cleanCode(folded);
  const code = slug.length >= 4 ? slug : `arc${Date.now().toString(36).slice(-6)}`;
  return updateLive(code, (sheet) => ({
    ...sheet,
    title: label || `${THEME} ${code}`,
    heard: sheet.heard.length
      ? sheet.heard
      : [{ id: `open-${Date.now().toString(36)}`, at: Date.now(), name: "Schreibtisch", text: "Protokoll eröffnet." }],
  }));
}

export function patchSheet(id: string, mutate: (sheet: ProtocolSheet) => ProtocolSheet): ProtocolSheet | null {
  const all = readSheets();
  const current = all.find((sheet) => sheet.id === id);
  if (!current) return null;
  const next = mutate(current);
  const saved: ProtocolSheet = {
    ...next,
    id: current.id,
    room: current.room,
    pinUntil: current.pinUntil,
    updatedAt: Date.now(),
    heard: next.heard.slice(-8),
    cards: next.cards.slice(0, 40),
  };
  writeSheets([saved, ...all.filter((sheet) => sheet.id !== id)]);
  return saved;
}

export function applySharedLine(room: string, line: { id: string; name: string; text: string }) {
  updateLive(room, (sheet) => {
    if (sheet.heard.some((item) => item.id === line.id)) return sheet;
    return {
      ...sheet,
      heard: [...sheet.heard, { id: line.id, name: line.name, text: line.text, at: Date.now() }].slice(-8),
    };
  });
}

export function applySharedCard(room: string, card: SheetCard) {
  updateLive(room, (sheet) => {
    const index = sheet.cards.findIndex((item) => item.id === card.id);
    if (index === -1) return { ...sheet, cards: [card, ...sheet.cards].slice(0, 40) };
    const current = sheet.cards[index];
    if (!current || card.kind !== "task" || current.kind !== "task" || Boolean(current.done) === Boolean(card.done)) return sheet;
    const cards = sheet.cards.slice();
    cards[index] = { ...current, done: card.done === true };
    return { ...sheet, cards };
  });
}
