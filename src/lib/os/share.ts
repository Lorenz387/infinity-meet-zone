import { useSyncExternalStore } from "react";
import { getCue, setCue } from "@/lib/os/cue";
import { exportNotes, importNotes } from "@/lib/os/desk";
import { exportJobs, importJobs } from "@/lib/os/jobs";
import { cleanCode, cleanName, makeId } from "@/lib/meet/media";
import { importSheets, readSheets } from "@/lib/os/sheets";
import { stopVoice } from "@/lib/os/voice";

export type SharePerson = { id: string; name: string };

export type ShareSnap = {
  room: string;
  people: SharePerson[];
  status: "off" | "live" | "full" | "error";
  note: string;
};

type Active = {
  room: string;
  name: string;
  peer: string;
  rev: number;
  lastSent: string;
  tokens: Set<object>;
  timer: number;
  pushTimer: number;
  stopped: boolean;
  dirty: boolean;
  mute: boolean;
  pushing: boolean;
  blocked: boolean;
  spins: number;
};

const OFF: ShareSnap = { room: "", people: [], status: "off", note: "" };
const CAP = 48_000;
const NOTE_BIG = "Der Tisch ist zu groß für die Leitung. Hier bleibt alles.";
const NOTE_SHORT = "Auf der Leitung liegt die Kurzfassung. Hier bleibt alles.";
const NOTE_DOWN = "Die gemeinsame Sitzung ist gerade nicht erreichbar. Deine Daten bleiben auf diesem Rechner.";
const NOTE_FULL = "Acht Personen sind schon dabei.";
let snap: ShareSnap = OFF;
let active: Active | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listen) => listen());
}

function setSnap(next: ShareSnap) {
  snap = next;
  emit();
}

export function getShare() {
  return snap;
}

export function subscribeShare(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

function peerId() {
  const existing = sessionStorage.getItem("arc-share-peer");
  if (existing && /^[a-z0-9]{8}$/.test(existing)) return existing;
  const next = makeId(8);
  sessionStorage.setItem("arc-share-peer", next);
  return next;
}

export function shareBody() {
  return {
    jobs: [...exportJobs()].sort((a, b) => a.room.localeCompare(b.room)),
    notes: exportNotes()
      .map((note) => ({ text: note.text, at: note.at }))
      .sort((a, b) => a.text.localeCompare(b.text))
      .slice(0, 12),
    sheets: [...readSheets()]
      .map((sheet) => ({ ...sheet, heard: sheet.heard.slice(-8), cards: sheet.cards.slice(0, 12) }))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 8),
    cue: getCue(),
  };
}

type Wire = ReturnType<typeof shareBody>;

export function fitShare(body: Wire): { body: Wire; trimmed: boolean } {
  if (JSON.stringify(body).length <= CAP) return { body, trimmed: false };
  let next: Wire = {
    ...body,
    notes: body.notes.slice(0, 8),
    sheets: body.sheets.slice(0, 4).map((sheet) => ({
      ...sheet,
      heard: sheet.heard.slice(-3),
      cards: sheet.cards.slice(0, 4),
    })),
  };
  if (JSON.stringify(next).length <= CAP) return { body: next, trimmed: true };
  next = { ...next, sheets: [], notes: body.notes.slice(0, 4) };
  if (JSON.stringify(next).length <= CAP) return { body: next, trimmed: true };
  return { body: { jobs: body.jobs.slice(0, 6), notes: [], sheets: [], cue: body.cue.slice(0, 140) }, trimmed: true };
}

function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canon(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function shareEcho(remote: unknown): "same" | "held" | "send" {
  const local = shareBody();
  if (canon(local) === canon(remote)) return "same";
  if (canon(fitShare(local).body) === canon(remote)) return "held";
  return "send";
}

function applyRemote(body: unknown, rev: number) {
  if (!active || !body || typeof body !== "object") return;
  const row = body as { jobs?: unknown; notes?: unknown; sheets?: unknown; cue?: unknown };
  const me = active;
  me.mute = true;
  me.rev = rev;
  importJobs(row.jobs, "newer");
  importNotes(row.notes);
  importSheets(row.sheets);
  if (typeof row.cue === "string") setCue(row.cue);
  me.mute = false;
  if (shareEcho(body) === "send") {
    me.lastSent = "";
    me.dirty = true;
  } else {
    me.lastSent = JSON.stringify(fitShare(shareBody()).body);
    me.dirty = false;
  }
}

async function push() {
  const me = active;
  if (!me || me.stopped || me.pushing || me.mute) return;
  const fitted = fitShare(shareBody());
  const raw = JSON.stringify(fitted.body);
  if (raw === me.lastSent) {
    me.dirty = false;
    return;
  }
  if (raw.length > CAP) {
    me.dirty = false;
    me.blocked = true;
    setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_BIG });
    return;
  }
  me.blocked = false;
  const note = fitted.trimmed ? NOTE_SHORT : "";
  me.pushing = true;
  me.dirty = false;
  let follow = true;
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "state", room: me.room, peer: me.peer, name: me.name, base: me.rev, body: JSON.parse(raw) as unknown }),
    });
    const data = (await res.json()) as { ok?: boolean; rev?: number; conflict?: boolean; body?: unknown; full?: boolean; error?: string };
    if (active !== me) return;
    if (data.full) {
      me.dirty = true;
      follow = false;
      setSnap({ room: me.room, people: snap.people, status: "full", note: NOTE_FULL });
      return;
    }
    if (res.status === 413 || data.error === "too large") {
      me.dirty = false;
      me.blocked = true;
      follow = false;
      setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_BIG });
      return;
    }
    if (!res.ok) {
      me.dirty = true;
      follow = false;
      setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_DOWN });
      return;
    }
    if (data.conflict && typeof data.rev === "number") {
      me.spins += 1;
      applyRemote(data.body, data.rev);
      if (me.spins >= 4 || !me.dirty) {
        me.dirty = false;
        me.spins = 0;
        follow = false;
      }
    } else if (data.ok && typeof data.rev === "number") {
      me.rev = data.rev;
      me.lastSent = raw;
      me.spins = 0;
      if (snap.note !== note || snap.status !== "live") setSnap({ room: me.room, people: snap.people, status: "live", note });
    } else {
      me.dirty = true;
      follow = false;
      setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_DOWN });
    }
  } catch {
    if (active === me) {
      me.dirty = true;
      follow = false;
      setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_DOWN });
    }
  } finally {
    if (active === me) {
      me.pushing = false;
      if (follow && me.dirty) void push();
    }
  }
}

async function pull() {
  const me = active;
  if (!me || me.stopped) return;
  try {
    const params = new URLSearchParams({ room: me.room, peer: me.peer, name: me.name, rev: String(me.rev) });
    const res = await fetch(`/api/share?${params}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { rev?: number; people?: SharePerson[]; body?: unknown; full?: boolean };
    if (active !== me) return;
    const people = Array.isArray(data.people) ? data.people : [];
    if (data.full) {
      me.dirty = true;
      setSnap({ room: me.room, people, status: "full", note: NOTE_FULL });
      return;
    }
    const quiet = snap.note === NOTE_FULL || (snap.status === "error" && !me.blocked);
    setSnap({ room: me.room, people, status: me.blocked ? "error" : "live", note: quiet ? "" : snap.note });
    if (typeof data.rev === "number" && data.body && data.rev !== me.rev) applyRemote(data.body, data.rev);
    else if (typeof data.rev === "number") {
      me.rev = data.rev;
      if (data.rev === 0) me.dirty = true;
    }
    if (me.dirty) void push();
  } catch {
    if (active === me && !me.blocked) setSnap({ room: me.room, people: snap.people, status: "error", note: NOTE_DOWN });
  }
}

function onLocal() {
  if (!active || active.mute || active.stopped) return;
  active.dirty = true;
  window.clearTimeout(active.pushTimer);
  active.pushTimer = window.setTimeout(() => void push(), 400);
}

function remember(room: string) {
  if (room) sessionStorage.setItem("arc-share-room", room);
  else sessionStorage.removeItem("arc-share-room");
}

function stop() {
  if (!active) return;
  const { room, peer, timer, pushTimer } = active;
  active.stopped = true;
  window.clearInterval(timer);
  window.clearTimeout(pushTimer);
  window.removeEventListener("arc-jobs", onLocal);
  window.removeEventListener("arc-notes", onLocal);
  window.removeEventListener("arc-sheets", onLocal);
  window.removeEventListener("arc-cue", onLocal);
  active = null;
  remember("");
  stopVoice();
  setSnap(OFF);
  void fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "leave", room, peer }),
  }).catch(() => {});
}

export function joinShare(room: string, name: string) {
  const code = cleanCode(room);
  const who = cleanName(name);
  if (code.length < 4) return () => {};
  const token = {};
  if (active && active.room === code && !active.stopped) {
    active.tokens.add(token);
    active.name = who;
    return () => {
      active?.tokens.delete(token);
      if (active && active.tokens.size === 0) stop();
    };
  }
  stop();
  const next: Active = {
    room: code,
    name: who,
    peer: peerId(),
    rev: 0,
    lastSent: "",
    tokens: new Set([token]),
    timer: 0,
    pushTimer: 0,
    stopped: false,
    dirty: false,
    mute: false,
    pushing: false,
    blocked: false,
    spins: 0,
  };
  active = next;
  remember(code);
  setSnap({ room: code, people: [], status: "live", note: "" });
  window.addEventListener("arc-jobs", onLocal);
  window.addEventListener("arc-notes", onLocal);
  window.addEventListener("arc-sheets", onLocal);
  window.addEventListener("arc-cue", onLocal);
  void pull();
  next.timer = window.setInterval(() => void pull(), 2000);
  return () => {
    next.tokens.delete(token);
    if (active === next && next.tokens.size === 0) stop();
  };
}

export function leaveShare() {
  stop();
}

export function savedShareRoom() {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem("arc-share-room") || "";
}

export function useShare() {
  return useSyncExternalStore(subscribeShare, getShare, () => OFF);
}
