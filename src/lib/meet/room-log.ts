import { keepSoon, readKept } from "@/lib/os/keep";

export type SavedChat = {
  id: string;
  name: string;
  text: string;
  at: number;
  kind: "user" | "system";
  self?: boolean;
};

export type SavedCaption = {
  id: string;
  name: string;
  text: string;
  at: number;
  translation?: string;
};

export type SavedAi = { role: "user" | "assistant"; text: string };

export type RoomLog = {
  chat: SavedChat[];
  captions: SavedCaption[];
  ai: SavedAi[];
  notes: string;
};

const KEY = "arc-rooms-v1";
const EMPTY: RoomLog = { chat: [], captions: [], ai: [], notes: "" };

function asChat(value: unknown): SavedChat | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SavedChat;
  if (typeof row.id !== "string" || typeof row.text !== "string") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name.slice(0, 64) : "Gast",
    text: row.text.slice(0, 2000),
    at: typeof row.at === "number" ? row.at : Date.now(),
    kind: row.kind === "system" ? "system" : "user",
    self: row.self === true,
  };
}

function asCaption(value: unknown): SavedCaption | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SavedCaption;
  if (typeof row.id !== "string" || typeof row.text !== "string") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name.slice(0, 64) : "",
    text: row.text.slice(0, 500),
    at: typeof row.at === "number" ? row.at : Date.now(),
    translation: typeof row.translation === "string" ? row.translation.slice(0, 500) : undefined,
  };
}

function asAi(value: unknown): SavedAi | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SavedAi;
  if ((row.role !== "user" && row.role !== "assistant") || typeof row.text !== "string") return null;
  return { role: row.role, text: row.text.slice(0, 4000) };
}

function readAll(): Record<string, RoomLog> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(readKept(KEY) || "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, RoomLog>;
  } catch {
    return {};
  }
}

export function loadRoom(code: string): RoomLog {
  const row = readAll()[code];
  if (!row || typeof row !== "object") return { ...EMPTY };
  return {
    chat: Array.isArray(row.chat) ? row.chat.map(asChat).filter((item): item is SavedChat => !!item).slice(-200) : [],
    captions: Array.isArray(row.captions) ? row.captions.map(asCaption).filter((item): item is SavedCaption => !!item).slice(-80) : [],
    ai: Array.isArray(row.ai) ? row.ai.map(asAi).filter((item): item is SavedAi => !!item).slice(-30) : [],
    notes: typeof row.notes === "string" ? row.notes.slice(0, 4000) : "",
  };
}

function weight(log: RoomLog) {
  return log.chat.length + log.captions.length + log.ai.length + (log.notes ? 1 : 0);
}

export function saveRoom(code: string, log: RoomLog) {
  if (typeof window === "undefined" || !code) return;
  const all = readAll();
  const next: RoomLog = {
    chat: log.chat.slice(-200),
    captions: log.captions.slice(-80).map(({ id, name, text, at, translation }) => ({ id, name, text, at, translation })),
    ai: log.ai.slice(-30),
    notes: log.notes.slice(0, 4000),
  };
  if (weight(loadRoom(code)) > 0 && weight(next) === 0) return;
  all[code] = next;
  const rooms = Object.keys(all);
  if (rooms.length > 12) {
    for (const extra of rooms.slice(0, rooms.length - 12)) delete all[extra];
  }
  keepSoon(KEY, JSON.stringify(all));
}
