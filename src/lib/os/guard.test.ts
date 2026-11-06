import assert from "node:assert/strict";
import test from "node:test";
import { clampPin, clampStamp, cleanId, cleanLabel, fitAgenda, fitShare, plainJob, plainSheet, readCappedBytes, readCappedJson } from "./guard.ts";

const NOW = 1_700_000_000_000;

test("a future stamp cannot outrun the room", () => {
  assert.equal(clampStamp(1e15, NOW), NOW + 60_000);
  assert.equal(clampStamp(Number.POSITIVE_INFINITY, NOW), NOW);
  const job = plainJob({ id: "job-1", client: "Ada", room: "abcd", kind: "film", at: 1e15, touch: { status: 1e15 } }, NOW);
  assert.equal(job?.at, NOW + 60_000);
  assert.equal(job?.touch?.status, NOW + 60_000);
});

test("a hostile job keeps only its own fields", () => {
  const raw = JSON.parse(
    '{"id":"job-1","client":"Ada <script>","room":"../ABCD","kind":"film","status":"root","line":"Schnitt","extra":"x","__proto__":{"admin":true}}',
  ) as unknown;
  const job = plainJob(raw, NOW);
  assert.ok(job);
  assert.equal(job.room, "abcd");
  assert.equal(job.client, "Ada script");
  assert.equal(job.status, "offen");
  assert.equal("extra" in job, false);
  assert.equal("admin" in job, false);
  assert.equal(plainJob({ id: "job-1", client: "Ada", room: "';--" }, NOW), null);
});

test("sheet ids survive and a far pin does not", () => {
  assert.equal(cleanId("live:demozone"), "live:demozone");
  const sheet = plainSheet(
    {
      id: "live:demozone",
      room: "demozone",
      title: "Schnitt",
      updatedAt: 1e15,
      pinUntil: NOW + 400 * 86_400_000,
      heard: [{ id: "h-1", name: "Ada", text: "Ich kümmere mich", at: NOW }],
      cards: [{ id: "c-1", kind: "task", title: "Schnitt", body: "Ada", at: NOW, done: true }, { id: "bad", kind: "audit", claim: "x" }],
    },
    NOW,
  );
  assert.equal(sheet?.id, "live:demozone");
  assert.equal(sheet?.updatedAt, NOW + 60_000);
  assert.equal(sheet?.pinUntil, NOW + 31 * 86_400_000);
  const card = sheet?.cards[0] as { kind?: string; done?: boolean } | undefined;
  assert.equal(sheet?.cards.length, 1);
  assert.equal(card?.kind, "task");
  assert.equal(card?.done, true);
  assert.equal(clampPin("later", NOW), null);
});

test("share and agenda drop what the wire must not keep", () => {
  const share = fitShare(
    {
      jobs: [{ id: "job-1", client: "Ada", room: "abcd", at: NOW }],
      notes: [{ text: "Liefertermin", at: NOW }],
      cue: "Wir starten",
      sheets: [{ id: "live:abcd", room: "abcd", heard: [], cards: [] }],
    },
    NOW,
  );
  assert.equal(share?.jobs.length, 1);
  assert.equal(share?.cue, "Wir starten");
  const cards = Array.from({ length: 40 }, (_, index) => ({ id: `c-${index}`, kind: "note", text: "x".repeat(500), at: NOW }));
  const sheets = Array.from({ length: 8 }, (_, index) => ({ id: `live:abcd${index}`, room: "abcd", heard: [], cards }));
  assert.equal(fitShare({ sheets }, NOW), null);
  const agenda = fitAgenda(
    { points: [{ id: "p-1", title: "Begrüßung", minutes: 5 }, { title: "weg", minutes: 0 }], index: 9, startedAt: Number.POSITIVE_INFINITY },
    NOW,
  );
  assert.equal(agenda?.points.length, 1);
  assert.equal(agenda?.index, 0);
  assert.equal(agenda?.startedAt, null);
  assert.equal(fitAgenda({ points: [] }, NOW), null);
  assert.equal(fitShare({ notes: [{ text: "Liefertermin\u202E", at: 1e15 }] }, NOW)?.notes[0]?.at, NOW + 60_000);
});

test("a short header cannot smuggle a large body", async () => {
  assert.equal(cleanLabel("Ada\u202E\u0000 <b>", 32), "Ada b");
  const ok = await readCappedJson(
    new Request("https://example.test/api/share", { method: "POST", body: JSON.stringify({ room: "abcd" }) }),
    1000,
  );
  assert.equal(ok.ok, true);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(80_000)));
      controller.close();
    },
  });
  const huge = await readCappedBytes(
    new Request("https://example.test/api/share", { method: "POST", body: stream, duplex: "half" } as RequestInit),
    1000,
  );
  assert.equal(huge.ok, false);
  const broken = await readCappedJson(new Request("https://example.test/api/share", { method: "POST", body: "{" }), 1000);
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.equal(broken.status, 400);
});
