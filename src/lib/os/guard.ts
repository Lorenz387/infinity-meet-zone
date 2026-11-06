const KINDS = new Set(["web", "film", "event", "laden", "dienst"]);
const STATUSES = new Set(["offen", "läuft", "fertig"]);
const BOOKED = new Set(["offen", "freigegeben", "abgelehnt"]);
const SHARE_MAX = 48_000;
const STEALTH = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g;

export function declaredTooBig(header: string | null, max = 100_000) {
  const len = Number(header || "0");
  return Number.isFinite(len) && len > max;
}

export function stripStealth(value: string) {
  return value.replace(STEALTH, "");
}

export async function readCappedBytes(
  request: Request,
  max: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: 413; error: "too large" }> {
  if (declaredTooBig(request.headers.get("content-length"), max)) {
    return { ok: false, status: 413, error: "too large" };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array() };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    if (total + value.byteLength > max) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: "too large" };
    }
    total += value.byteLength;
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function readCappedJson(
  request: Request,
  max = 100_000,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  const capped = await readCappedBytes(request, max);
  if (!capped.ok) return capped;
  if (!capped.bytes.byteLength) return { ok: false, status: 400, error: "invalid JSON" };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(capped.bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
}

export function clampStamp(value: unknown, now = Date.now()) {
  const min = now - 366 * 86_400_000;
  const max = now + 60_000;
  if (typeof value !== "number" || !Number.isFinite(value)) return now;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampStarted(value: unknown, now = Date.now()) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < now - 6 * 3_600_000 || value > now + 60_000) return null;
  return Math.round(value);
}

export function clampPin(value: unknown, now = Date.now()) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const max = now + 31 * 86_400_000;
  return Math.min(max, Math.round(value));
}

export function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return stripStealth(value).replace(/[<>]/g, "").trim().slice(0, max);
}

export function cleanLabel(value: unknown, max = 32) {
  if (typeof value !== "string") return "";
  return stripStealth(value).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanId(value: unknown, max = 48) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>"'`\\]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max);
}

export function cleanRoom(value: unknown) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
}

function plainRooms(value: unknown, primary: string) {
  if (!Array.isArray(value)) return [];
  const rooms: string[] = [];
  for (const item of value) {
    const room = cleanRoom(item);
    if (room.length < 4 || room === primary || rooms.includes(room)) continue;
    rooms.push(room);
    if (rooms.length >= 4) break;
  }
  return rooms;
}

function asWhen(value: unknown) {
  if (typeof value !== "string") return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function plainCrew(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as { name?: unknown; role?: unknown };
  const name = cleanText(row.name, 32);
  if (!name) return null;
  return { name, role: cleanText(row.role, 32) };
}

function plainSign(value: unknown, now: number) {
  if (!value || typeof value !== "object") return null;
  const row = value as { by?: unknown; text?: unknown; at?: unknown };
  const text = cleanText(row.text, 80);
  if (!text) return null;
  return { by: cleanText(row.by, 40) || "Du", text, at: clampStamp(row.at, now) };
}

function plainTouch(value: unknown, now: number) {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const fields = ["status", "when", "place", "line", "crew", "sign", "client", "kind"] as const;
  const touch: Partial<Record<(typeof fields)[number], number>> = {};
  for (const field of fields) {
    const at = row[field];
    if (typeof at === "number" && Number.isFinite(at)) touch[field] = clampStamp(at, now);
  }
  return Object.keys(touch).length ? touch : undefined;
}

export function plainJob(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = cleanId(row.id);
  const room = cleanRoom(row.room);
  const client = cleanText(row.client, 40);
  if (!id || room.length < 4 || !client) return null;
  const kind = typeof row.kind === "string" && KINDS.has(row.kind) ? row.kind : "dienst";
  const status = typeof row.status === "string" && STATUSES.has(row.status) ? row.status : "offen";
  return {
    id,
    client,
    kind,
    line: cleanText(row.line, 160),
    status,
    room,
    rooms: plainRooms(row.rooms, room),
    at: clampStamp(row.at, now),
    when: asWhen(row.when),
    place: cleanText(row.place, 48),
    crew: Array.isArray(row.crew) ? row.crew.map(plainCrew).filter((item) => !!item).slice(0, 8) : [],
    sign: plainSign(row.sign, now),
    touch: plainTouch(row.touch, now),
  };
}

function plainCard(value: unknown, now: number) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = cleanId(row.id, 40);
  const kind = row.kind;
  if (!id || typeof kind !== "string") return null;
  const at = clampStamp(row.at, now);
  if (kind === "widget" && row.widget === "todo") {
    return { id, at, kind, widget: "todo" as const, title: cleanText(row.title, 80), body: cleanText(row.body, 280) };
  }
  if (kind === "task") return { id, at, kind, title: cleanText(row.title, 160), body: cleanText(row.body, 400), ...(row.done === true ? { done: true } : {}) };
  if (kind === "note") {
    const text = cleanText(row.text, 500);
    return text ? { id, at, kind, text } : null;
  }
  if (kind === "mail") {
    const subject = cleanText(row.subject, 120);
    return subject ? { id, at, kind, subject, body: cleanText(row.body, 500) } : null;
  }
  if (kind === "booking") {
    const status = typeof row.status === "string" && BOOKED.has(row.status) ? row.status : "offen";
    const place = cleanText(row.place, 48);
    return place ? { id, at, kind, place, status } : null;
  }
  return null;
}

export function plainSheet(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = cleanId(row.id, 64);
  const room = cleanRoom(row.room);
  if (!id || room.length < 4) return null;
  const heard = Array.isArray(row.heard)
    ? row.heard
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const line = item as Record<string, unknown>;
          const lineId = cleanId(line.id, 40);
          const text = cleanText(line.text, 240);
          if (!lineId || !text) return null;
          return { id: lineId, at: clampStamp(line.at, now), name: cleanText(line.name, 40) || "Gast", text };
        })
        .filter((item) => !!item)
        .slice(-8)
    : [];
  const cards = Array.isArray(row.cards)
    ? row.cards.map((item) => plainCard(item, now)).filter((item) => !!item).slice(0, 40)
    : [];
  return {
    id,
    room,
    title: cleanText(row.title, 80),
    updatedAt: clampStamp(row.updatedAt, now),
    pinUntil: clampPin(row.pinUntil, now),
    heard,
    cards,
  };
}

export function fitShare(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const row = value as { jobs?: unknown; notes?: unknown; sheets?: unknown; cue?: unknown };
  const notes = Array.isArray(row.notes)
    ? row.notes
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const note = item as { text?: unknown; at?: unknown };
          const text = cleanText(note.text, 420);
          if (!text) return null;
          return { text, at: clampStamp(note.at, now) };
        })
        .filter((item) => !!item)
        .slice(0, 12)
    : [];
  const body = {
    jobs: Array.isArray(row.jobs) ? row.jobs.map((item) => plainJob(item, now)).filter((item) => !!item).slice(0, 12) : [],
    notes,
    sheets: Array.isArray(row.sheets) ? row.sheets.map((item) => plainSheet(item, now)).filter((item) => !!item).slice(0, 8) : [],
    cue: cleanText(row.cue, 140),
  };
  if (JSON.stringify(body).length > SHARE_MAX) return null;
  return body;
}

export function fitAgenda(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const row = value as { points?: unknown; index?: unknown; startedAt?: unknown };
  if (!Array.isArray(row.points)) return null;
  const points = row.points
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const point = item as { id?: unknown; title?: unknown; minutes?: unknown };
      const title = cleanText(point.title, 80);
      const minutes = typeof point.minutes === "number" && Number.isFinite(point.minutes) ? Math.round(point.minutes) : 0;
      if (!title || minutes < 1 || minutes > 60) return null;
      const id = cleanId(point.id, 24) || `p-${cleanId(title, 12) || "punkt"}`;
      return { id, title, minutes };
    })
    .filter((point) => !!point)
    .slice(0, 8);
  if (!points.length) return null;
  const index = typeof row.index === "number" && Number.isFinite(row.index) ? Math.min(Math.max(0, Math.floor(row.index)), points.length - 1) : 0;
  return { points, index, startedAt: clampStarted(row.startedAt, now) };
}

export function fitMemory(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const row = value as { heard?: unknown; tasks?: unknown; covered?: unknown; decided?: unknown; now?: unknown; cue?: unknown; job?: unknown; begun?: unknown };
  const heard = Array.isArray(row.heard)
    ? row.heard
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const line = item as { id?: unknown; name?: unknown; text?: unknown; at?: unknown };
          const id = cleanId(line.id, 40);
          const text = cleanText(line.text, 240);
          if (!id || !text) return null;
          return { id, name: cleanText(line.name, 40) || "Gast", text, at: clampStamp(line.at, now) };
        })
        .filter((item) => !!item)
        .slice(-16)
    : [];
  const tasks = Array.isArray(row.tasks)
    ? row.tasks
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const task = item as { id?: unknown; title?: unknown; body?: unknown; done?: unknown; at?: unknown };
          const id = cleanId(task.id, 40);
          const title = cleanText(task.title, 160);
          if (!id || !title) return null;
          return { id, title, body: cleanText(task.body, 280), done: task.done === true, at: clampStamp(task.at, now) };
        })
        .filter((item) => !!item)
        .slice(0, 12)
    : [];
  const covered = Array.isArray(row.covered)
    ? row.covered
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const point = item as { id?: unknown; title?: unknown };
          const id = cleanId(point.id, 24);
          const title = cleanText(point.title, 80);
          if (!id || !title) return null;
          return { id, title };
        })
        .filter((item) => !!item)
        .slice(0, 8)
    : [];
  const decided = Array.isArray(row.decided)
    ? row.decided
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const decision = item as { id?: unknown; title?: unknown; by?: unknown; at?: unknown };
          const id = cleanId(decision.id, 40);
          const title = cleanText(decision.title, 160);
          if (!id || !title) return null;
          return { id, title, by: cleanText(decision.by, 40), at: clampStamp(decision.at, now) };
        })
        .filter((item) => !!item)
        .slice(0, 12)
    : [];
  const memory = {
    heard,
    tasks,
    covered,
    decided,
    now: cleanText(row.now, 80),
    cue: cleanText(row.cue, 140),
    job: cleanText(row.job, 120),
    begun: row.begun === true,
  };
  if (!memory.heard.length && !memory.tasks.length && !memory.covered.length && !memory.decided.length && !memory.now && !memory.cue && !memory.job) return null;
  return memory;
}
