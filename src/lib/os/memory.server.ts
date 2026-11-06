import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { fitMemory, readCappedJson } from "@/lib/os/guard";
import { auth } from "@/lib/auth/server";
import { EMPTY_MEMORY, claimMemory, mergeMemory, type RoomMemory } from "@/lib/os/memory";

const ROOM = z.string().regex(/^[a-z0-9]{4,12}$/);
const globalRef = globalThis as typeof globalThis & { __arcMemorySchema__?: Promise<void> };

function ensureSchema(sql: Sql) {
  globalRef.__arcMemorySchema__ ??= sql
    .query(
      `CREATE TABLE IF NOT EXISTS arc_memory (
         room TEXT PRIMARY KEY,
         body JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    )
    .then(() => undefined)
    .catch((error) => {
      globalRef.__arcMemorySchema__ = undefined;
      throw error;
    });
  return globalRef.__arcMemorySchema__;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function trimRooms(sql: Sql) {
  try {
    const counted = await sql.query<{ n: number | string }>(`SELECT count(*)::int AS n FROM arc_memory`);
    if (Number(counted[0]?.n ?? 0) < 2000) return;
    await sql.query(`DELETE FROM arc_memory WHERE room IN (SELECT room FROM arc_memory ORDER BY updated_at ASC LIMIT 200)`);
  } catch (error) {
    console.error("[memory] trim failed", error);
  }
}

function stored(value: unknown): RoomMemory {
  return fitMemory(value) ?? EMPTY_MEMORY;
}

async function signedWriter(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const name = session?.user?.name?.trim() ?? "";
    if (!name || name === "Gast") return "";
    return name.slice(0, 40);
  } catch (error) {
    console.error("[memory] session", error);
    return "";
  }
}

export async function handleMemory(request: Request) {
  try {
    const sql = await getSql();
    await ensureSchema(sql);
    if (request.method === "GET") {
      const room = ROOM.safeParse(new URL(request.url).searchParams.get("room"));
      if (!room.success) return json({ error: "invalid room" }, 400);
      const rows = await sql.query<{ body: unknown }>(`SELECT body FROM arc_memory WHERE room = $1`, [room.data]);
      return json({ memory: stored(rows[0]?.body) });
    }
    if (request.method === "POST") {
      const capped = await readCappedJson(request);
      if (!capped.ok) return json({ error: capped.error }, capped.status);
      const payload = capped.value;
      if (!payload || typeof payload !== "object") return json({ error: "invalid memory" }, 400);
      const row = payload as { room?: unknown; memory?: unknown };
      const room = ROOM.safeParse(row.room);
      const incoming = fitMemory(row.memory);
      if (!room.success || !incoming) return json({ error: "invalid memory" }, 400);
      const current = await sql.query<{ body: unknown }>(`SELECT body FROM arc_memory WHERE room = $1`, [room.data]);
      const kept = stored(current[0]?.body);
      const writer = await signedWriter(request);
      const incomingNamed = writer ? claimMemory(kept, incoming, writer) : incoming;
      const memory = mergeMemory(kept, incomingNamed);
      await trimRooms(sql);
      await sql.query(
        `INSERT INTO arc_memory (room, body, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (room) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
        [room.data, JSON.stringify(memory)],
      );
      return json({ ok: true, memory });
    }
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[memory] error:", error);
    return json({ error: "memory failed" }, 500);
  }
}
