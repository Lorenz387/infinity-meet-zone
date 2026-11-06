import { keepNow, readKept } from "@/lib/os/keep";
import { cleanCode } from "@/lib/meet/media";

export type AgendaPoint = { id: string; title: string; minutes: number };
export type Agenda = { points: AgendaPoint[]; index: number; startedAt: number | null };

const KEY = "arc-agenda-v1";
const EMPTY: Agenda = { points: [], index: 0, startedAt: null };

function all(): Record<string, Agenda> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(readKept(KEY) || "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, Agenda>;
  } catch {
    return {};
  }
}

function writeAll(next: Record<string, Agenda>) {
  keepNow(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("arc-agenda"));
}

export function asAgenda(value: unknown): Agenda {
  if (!value || typeof value !== "object") return EMPTY;
  const row = value as { points?: unknown; index?: unknown; startedAt?: unknown };
  const points = Array.isArray(row.points)
    ? row.points
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const point = item as AgendaPoint;
          const title = typeof point.title === "string" ? point.title.trim().slice(0, 80) : "";
          const minutes = typeof point.minutes === "number" ? Math.round(point.minutes) : 0;
          if (!title || minutes < 1 || minutes > 60) return null;
          const id = typeof point.id === "string" && point.id ? point.id : `p-${title}`;
          return { id, title, minutes };
        })
        .filter((point): point is AgendaPoint => !!point)
        .slice(0, 8)
    : [];
  const index = typeof row.index === "number" && row.index >= 0 ? Math.min(Math.floor(row.index), Math.max(0, points.length - 1)) : 0;
  const startedAt = typeof row.startedAt === "number" ? row.startedAt : null;
  return { points, index, startedAt };
}

export function readAgenda(room: string): Agenda {
  const code = cleanCode(room);
  if (code.length < 4) return EMPTY;
  return asAgenda(all()[code]);
}

export function saveAgenda(room: string, agenda: Agenda) {
  const code = cleanCode(room);
  if (code.length < 4) return;
  const next = asAgenda(agenda);
  const book = all();
  book[code] = next;
  writeAll(book);
}

export async function pullAgenda(room: string): Promise<Agenda> {
  const local = readAgenda(room);
  const code = cleanCode(room);
  if (code.length < 4) return local;
  try {
    const res = await fetch(`/api/agenda?room=${code}`);
    if (!res.ok) return local;
    const data = (await res.json()) as { agenda?: unknown };
    if (!data.agenda) return local;
    const remote = asAgenda(data.agenda);
    if (!remote.points.length) return local;
    saveAgenda(code, remote);
    return remote;
  } catch {
    return local;
  }
}

export async function pushAgenda(room: string, agenda: Agenda): Promise<boolean> {
  const code = cleanCode(room);
  const next = asAgenda(agenda);
  if (code.length < 4 || !next.points.length) return false;
  saveAgenda(code, next);
  try {
    const res = await fetch("/api/agenda", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room: code, agenda: next }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function agendaLeft(agenda: Agenda, now: number) {
  const point = agenda.points[agenda.index] ?? null;
  if (!point) return { point: null, left: 0, over: false, total: 0 };
  const total = point.minutes * 60_000;
  if (agenda.startedAt == null) return { point, left: total, over: false, total };
  const left = total - (now - agenda.startedAt);
  return { point, left: Math.max(0, left), over: left <= 0, total };
}
