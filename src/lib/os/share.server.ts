import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { cleanLabel, fitShare, readCappedJson } from "@/lib/os/guard";

const ROOM = z.string().regex(/^[a-z0-9]{4,12}$/);
const PEER = z.string().regex(/^[a-z0-9]{4,32}$/);
const CAP = 8;
const TTL = 20;

const globalRef = globalThis as typeof globalThis & { __arcShareSchema__?: Promise<void> };

function ensureSchema(sql: Sql) {
  globalRef.__arcShareSchema__ ??= (async () => {
    await sql.query(
      `CREATE TABLE IF NOT EXISTS arc_share (
         room TEXT PRIMARY KEY,
         rev BIGINT NOT NULL DEFAULT 0,
         body JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS arc_share_people (
         room TEXT NOT NULL,
         peer_id TEXT NOT NULL,
         name TEXT NOT NULL DEFAULT '',
         last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (room, peer_id)
       )`,
    );
  })().catch((error) => {
    globalRef.__arcShareSchema__ = undefined;
    throw error;
  });
  return globalRef.__arcShareSchema__;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function trimRooms(sql: Sql) {
  try {
    const counted = await sql.query<{ n: number | string }>(`SELECT count(*)::int AS n FROM arc_share`);
    if (Number(counted[0]?.n ?? 0) < 2000) return;
    await sql.query(
      `DELETE FROM arc_share WHERE room IN (SELECT room FROM arc_share ORDER BY updated_at ASC LIMIT 200)`,
    );
  } catch (error) {
    console.error("[share] trim failed", error);
  }
}

function cleanBody(value: unknown) {
  return fitShare(value);
}

async function people(sql: Sql, room: string) {
  const rows = await sql.query<{ peer_id: string; name: string }>(
    `SELECT peer_id, name FROM arc_share_people
     WHERE room = $1 AND last_seen > now() - make_interval(secs => $2)
     ORDER BY peer_id LIMIT 16`,
    [room, TTL],
  );
  return rows.map((row) => ({ id: row.peer_id, name: cleanLabel(row.name, 32) || "Gast" }));
}

async function touch(sql: Sql, room: string, peer: string, name: string) {
  await sql.query(
    `INSERT INTO arc_share_people (room, peer_id, name, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (room, peer_id)
     DO UPDATE SET name = EXCLUDED.name, last_seen = now()`,
    [room, peer, cleanLabel(name, 32)],
  );
}

async function current(sql: Sql, room: string) {
  const rows = await sql.query<{ rev: number | string; body: unknown }>(
    `SELECT rev, body FROM arc_share WHERE room = $1`,
    [room],
  );
  const row = rows[0];
  return { rev: row ? Number(row.rev) : 0, body: row?.body ?? null };
}

async function handleGet(url: URL) {
  const parsed = z
    .object({
      room: ROOM,
      peer: PEER,
      name: z.string().max(32).default(""),
      rev: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      rev: url.searchParams.get("rev") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, name, rev } = parsed.data;
  const sql = await getSql();
  await ensureSchema(sql);
  await sql.query(`DELETE FROM arc_share_people WHERE last_seen < now() - make_interval(secs => $1)`, [TTL]);
  let roster = await people(sql, room);
  if (!roster.some((item) => item.id === peer) && roster.length >= CAP) {
    return json({ full: true, rev, people: roster.slice(0, CAP) });
  }
  await touch(sql, room, peer, name);
  roster = await people(sql, room);
  const state = await current(sql, room);
  const stored = state.rev !== rev ? fitShare(state.body) : undefined;
  return json({ rev: state.rev, people: roster, ...(stored ? { body: stored } : {}) });
}

async function handlePost(request: Request) {
  const capped = await readCappedJson(request);
  if (!capped.ok) return json({ error: capped.error }, capped.status);
  const payload = capped.value;
  const parsed = z
    .discriminatedUnion("op", [
      z.object({
        op: z.literal("state"),
        room: ROOM,
        peer: PEER,
        name: z.string().max(32).default(""),
        base: z.number().int().min(0),
        body: z.unknown(),
      }),
      z.object({ op: z.literal("leave"), room: ROOM, peer: PEER }),
    ])
    .safeParse(payload);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  const sql = await getSql();
  await ensureSchema(sql);
  await sql.query(`DELETE FROM arc_share_people WHERE last_seen < now() - make_interval(secs => $1)`, [TTL]);
  if (msg.op === "leave") {
    await sql.query(`DELETE FROM arc_share_people WHERE room = $1 AND peer_id = $2`, [msg.room, msg.peer]);
    return json({ ok: true });
  }
  const body = cleanBody(msg.body);
  if (!body) return json({ error: "too large" }, 413);
  await trimRooms(sql);
  const roster = await people(sql, msg.room);
  if (!roster.some((item) => item.id === msg.peer) && roster.length >= CAP) return json({ full: true });
  await touch(sql, msg.room, msg.peer, msg.name);
  const written = await sql.query<{ rev: number | string }>(
    `INSERT INTO arc_share (room, rev, body, updated_at)
     VALUES ($1, 1, $2::jsonb, now())
     ON CONFLICT (room) DO UPDATE
     SET body = EXCLUDED.body, rev = arc_share.rev + 1, updated_at = now()
     WHERE arc_share.rev = $3
     RETURNING rev`,
    [msg.room, JSON.stringify(body), msg.base],
  );
  if (written[0]) return json({ ok: true, rev: Number(written[0].rev) });
  const state = await current(sql, msg.room);
  return json({ conflict: true, rev: state.rev, body: fitShare(state.body) });
}

export async function handleShare(request: Request) {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[share] error:", error);
    return json({ error: "share failed" }, 500);
  }
}
