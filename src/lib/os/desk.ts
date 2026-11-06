import { useEffect, useState } from "react";
import type { AppId } from "@/lib/os/arcy";
import { clampStamp, cleanId, stripStealth } from "@/lib/os/guard";
import { keepNow, keepSoon, readKept } from "@/lib/os/keep";

const APPS: AppId[] = ["arcy", "tag", "datei", "seite", "blaetter", "runde", "transkript", "gedanke", "einbinden", "hub"];

export type DeskWin = { id: AppId; x: number; y: number; z: number; aside: boolean };

export type DeskNote = { id: string; text: string; at: number };

const WINS = "arc-desk-v1";
const NOTES = "arc-notes-v1";

let deskMemory: { wins: DeskWin[]; focus: AppId | null } | null = null;

function asWin(value: unknown): DeskWin | null {
  if (!value || typeof value !== "object") return null;
  const row = value as DeskWin;
  if (!APPS.includes(row.id)) return null;
  return {
    id: row.id,
    x: typeof row.x === "number" ? row.x : 24,
    y: typeof row.y === "number" ? row.y : 24,
    z: typeof row.z === "number" ? row.z : 1,
    aside: row.aside === true,
  };
}

export function loadDesk(): { wins: DeskWin[]; focus: AppId | null } {
  if (deskMemory) return deskMemory;
  if (typeof window === "undefined") return { wins: [], focus: null };
  try {
    const raw = JSON.parse(readKept(WINS) || "null") as { wins?: unknown; focus?: unknown } | null;
    const wins = Array.isArray(raw?.wins) ? raw.wins.map(asWin).filter((win): win is DeskWin => !!win).slice(0, 8) : [];
    const focus = APPS.includes(raw?.focus as AppId) ? (raw?.focus as AppId) : null;
    return { wins, focus: wins.some((win) => win.id === focus && !win.aside) ? focus : null };
  } catch {
    return { wins: [], focus: null };
  }
}

export function saveDesk(wins: DeskWin[], focus: AppId | null) {
  const next = { wins: wins.slice(0, 8), focus };
  deskMemory = next;
  keepSoon(WINS, JSON.stringify(next));
}

function readNotes(): DeskNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(readKept(NOTES) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((row): row is DeskNote => !!row && typeof row.id === "string" && typeof row.text === "string").slice(0, 12);
  } catch {
    return [];
  }
}

function writeNotes(notes: DeskNote[]) {
  keepNow(NOTES, JSON.stringify(notes.slice(0, 12)));
  window.dispatchEvent(new Event("arc-notes"));
}

export function addNote(text: string) {
  const clean = text.trim().slice(0, 420);
  if (!clean) return;
  writeNotes([{ id: `n-${Date.now().toString(36)}`, text: clean, at: Date.now() }, ...readNotes()].slice(0, 12));
}

export function forgetNote(id: string) {
  writeNotes(readNotes().filter((note) => note.id !== id));
}

export function exportNotes() {
  return readNotes();
}

export function importNotes(value: unknown) {
  if (!Array.isArray(value)) return 0;
  const incoming = value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as DeskNote;
      const text = typeof item.text === "string" ? stripStealth(item.text).trim().slice(0, 420) : "";
      if (!text) return null;
      const id = cleanId(item.id, 48) || `n-${Date.now().toString(36)}`;
      return { id, text, at: clampStamp(item.at) };
    })
    .filter((note): note is DeskNote => !!note);
  const local = readNotes();
  const map = new Map(local.map((note) => [note.text, note]));
  let added = 0;
  for (const note of incoming) {
    const prev = map.get(note.text);
    if (!prev) {
      map.set(note.text, note);
      added += 1;
    } else if (note.at > prev.at) map.set(note.text, { ...note, id: prev.id });
  }
  const next = [...map.values()].sort((a, b) => b.at - a.at).slice(0, 12);
  if (JSON.stringify(next) === JSON.stringify(local)) return added;
  writeNotes(next);
  return added;
}

export function useDeskNotes() {
  const [notes, setNotes] = useState<DeskNote[]>([]);
  useEffect(() => {
    const pull = () => setNotes(readNotes());
    pull();
    window.addEventListener("arc-notes", pull);
    return () => window.removeEventListener("arc-notes", pull);
  }, []);
  return notes;
}
