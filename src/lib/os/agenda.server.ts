import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { fitAgenda, readCappedJson } from "@/lib/os/guard";

const ROOM = z.string().regex(/^[a-z0-9]{4,12}$/);
const globalRef = globalThis as typeof globalThis & { __arcAgendaSchema__?: Promise<void> };

function ensureSchema(sql: Sql) {
  globalRef.__arcAgendaSchema__ ??= sql
    .query(
      `CREATE TABLE IF NOT EXISTS arc_agenda (
         room TEXT PRIMARY KEY,
         body JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    )
    .then(() => undefined)
    .catch((error) => {
      globalRef.__arcAgendaSchema__ = undefined;
      throw error;
    });
  return globalRef.__arcAgendaSchema__;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function trimRooms(sql: Sql) {
  try {
    const counted = await sql.query<{ n: number | string }>(`SELECT count(*)::int AS n FROM arc_agenda`);
    if (Number(counted[0]?.n ?? 0) < 2000) return;
    await sql.query(
      `DELETE FROM arc_agenda WHERE room IN (SELECT room FROM arc_agenda ORDER BY updated_at ASC LIMIT 200)`,
    );
  } catch (error) {
    console.error("[agenda] trim failed", error);
  }
}

function cleanAgenda(value: unknown) {
  return fitAgenda(value);
}

function agendaForRead(value: unknown) {
  const cleaned = fitAgenda(value);
  if (!cleaned || !value || typeof value !== "object") return cleaned;
  const started = (value as { startedAt?: unknown }).startedAt;
  const now = Date.now();
  if (typeof started === "number" && Number.isFinite(started) && started >= now - 31 * 86_400_000 && started <= now + 60_000) {
    cleaned.startedAt = Math.round(started);
  }
  return cleaned;
}

export async function handleAgenda(request: Request) {
  try {
    const sql = await getSql();
    await ensureSchema(sql);
    if (request.method === "GET") {
      const room = ROOM.safeParse(new URL(request.url).searchParams.get("room"));
      if (!room.success) return json({ error: "invalid room" }, 400);
      const rows = await sql.query<{ body: unknown }>(`SELECT body FROM arc_agenda WHERE room = $1`, [room.data]);
      return json({ agenda: agendaForRead(rows[0]?.body) });
    }
    if (request.method === "POST") {
      const capped = await readCappedJson(request);
      if (!capped.ok) return json({ error: capped.error }, capped.status);
      const payload = capped.value;
      if (!payload || typeof payload !== "object") return json({ error: "invalid agenda" }, 400);
      const row = payload as { room?: unknown; agenda?: unknown };
      const room = ROOM.safeParse(row.room);
      const agenda = cleanAgenda(row.agenda);
      if (!room.success || !agenda) return json({ error: "invalid agenda" }, 400);
      await trimRooms(sql);
      await sql.query(
        `INSERT INTO arc_agenda (room, body, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (room) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
        [room.data, JSON.stringify(agenda)],
      );
      return json({ ok: true, agenda });
    }
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[agenda] error:", error);
    return json({ error: "agenda failed" }, 500);
  }
}
