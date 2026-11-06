import assert from "node:assert/strict";
import test from "node:test";
import { fitMemory } from "./guard.ts";
import { EMPTY_MEMORY, claimMemory, mergeMemory, noteGate } from "./memory.ts";

const NOW = 1_700_000_000_000;

test("a later task wins and an empty note does not wipe the room", () => {
  const kept = mergeMemory(
    {
      ...EMPTY_MEMORY,
      heard: [{ id: "h1", name: "Ada", text: "Wir schneiden Szene 2.", at: NOW }],
      tasks: [{ id: "t1", title: "Schnitt", body: "Ada", done: false, at: NOW }],
      cue: "Wir starten",
      begun: true,
    },
    {
      ...EMPTY_MEMORY,
      heard: [{ id: "h2", name: "Ben", text: "Ich schreibe die Fassung.", at: NOW + 1000 }],
      tasks: [{ id: "t1", title: "Schnitt", body: "Ada", done: true, at: NOW + 2000 }],
      covered: [{ id: "p1", title: "Begrüßung" }],
    },
  );
  assert.equal(kept.heard.length, 2);
  assert.equal(kept.tasks[0]?.done, true);
  assert.equal(kept.cue, "Wir starten");
  assert.equal(kept.begun, true);
  assert.equal(kept.covered[0]?.title, "Begrüßung");
  const older = mergeMemory(kept, { ...EMPTY_MEMORY, tasks: [{ id: "t1", title: "Schnitt", body: "Ada", done: false, at: NOW }] });
  assert.equal(older.tasks[0]?.done, true);
  assert.equal(older.decided[0]?.title, "Schnitt");
  const wiped = mergeMemory(older, {
    ...EMPTY_MEMORY,
    heard: [{ id: "h1", name: "Gast", text: "Weg.", at: NOW + 5000 }],
    tasks: [{ id: "t1", title: "Schnitt", body: "", done: false, at: NOW + 5000 }],
  });
  assert.equal(wiped.tasks[0]?.done, true);
  assert.equal(wiped.heard.find((line) => line.id === "h1")?.name, "Ada");
  assert.equal(wiped.heard.find((line) => line.id === "h1")?.text, "Wir schneiden Szene 2.");
  const stolen = mergeMemory(wiped, {
    ...EMPTY_MEMORY,
    heard: [{ id: "h1", name: "Ben", text: "Das habe ich nicht gesagt.", at: NOW + 9000 }],
  });
  assert.equal(stolen.heard.find((line) => line.id === "h1")?.name, "Ada");
  assert.equal(stolen.heard.find((line) => line.id === "h1")?.text, "Wir schneiden Szene 2.");
  const own = mergeMemory(stolen, {
    ...EMPTY_MEMORY,
    heard: [{ id: "h1", name: "Ada", text: "Wir schneiden Szene 3.", at: NOW + 9500 }],
  });
  assert.equal(own.heard.find((line) => line.id === "h1")?.text, "Wir schneiden Szene 3.");
  assert.equal(wiped.decided[0]?.by, "Ada");
  assert.equal(wiped.decided.length, 1);
});

test("a decision stays with its name", () => {
  const ada = mergeMemory(EMPTY_MEMORY, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d1", title: "Ton", by: "Ada", at: NOW }],
  });
  const earlier = mergeMemory(ada, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d1", title: "Schnitt", by: "Ben", at: NOW - 50_000 }],
  });
  assert.equal(earlier.decided[0]?.by, "Ada");
  assert.equal(earlier.decided[0]?.title, "Ton");
  const later = mergeMemory(earlier, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d1", title: "Schnitt", by: "Ben", at: NOW + 50_000 }],
  });
  assert.equal(later.decided[0]?.by, "Ada");
  assert.equal(later.decided[0]?.title, "Ton");
  const guest = mergeMemory(later, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d1", title: "Weg", by: "Gast", at: NOW + 80_000 }],
  });
  assert.equal(guest.decided[0]?.by, "Ada");
  const unnamed = mergeMemory(EMPTY_MEMORY, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d2", title: "Licht", by: "", at: NOW }],
  });
  const claimed = mergeMemory(unnamed, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d2", title: "Licht", by: "Ben", at: NOW + 10_000 }],
  });
  assert.equal(claimed.decided.find((item) => item.id === "d2")?.by, "");
  const own = mergeMemory(guest, {
    ...EMPTY_MEMORY,
    decided: [{ id: "d1", title: "Ton bleibt", by: "Ada", at: NOW + 10_000 }],
  });
  assert.equal(own.decided[0]?.title, "Ton bleibt");
  assert.equal(own.decided[0]?.by, "Ada");
  const viaTask = mergeMemory(own, {
    ...EMPTY_MEMORY,
    tasks: [{ id: "d1", title: "Schnitt", body: "Ben", done: true, at: NOW + 20_000 }],
  });
  assert.equal(viaTask.decided.find((item) => item.id === "d1")?.by, "Ada");
  assert.equal(viaTask.decided.find((item) => item.id === "d1")?.title, "Ton bleibt");
  const empty = mergeMemory(viaTask, EMPTY_MEMORY);
  assert.equal(empty.decided.find((item) => item.id === "d1")?.title, "Ton bleibt");
});

test("a signed-in name cannot write as someone else", () => {
  const base = mergeMemory(EMPTY_MEMORY, {
    ...EMPTY_MEMORY,
    heard: [{ id: "h1", name: "Ada", text: "Ton bleibt.", at: NOW }],
    decided: [{ id: "d1", title: "Ton", by: "Ada", at: NOW }],
  });
  const forged = claimMemory(
    base,
    {
      ...base,
      heard: [
        { id: "h1", name: "Ben", text: "Weg.", at: NOW + 1000 },
        { id: "h2", name: "Ada", text: "Das war ich nicht.", at: NOW + 2000 },
      ],
      decided: [
        { id: "d1", title: "Schnitt", by: "Ben", at: NOW + 1000 },
        { id: "d2", title: "Licht", by: "Ada", at: NOW + 2000 },
      ],
    },
    "Ben",
  );
  const kept = mergeMemory(base, forged);
  assert.equal(kept.heard.find((line) => line.id === "h1")?.name, "Ada");
  assert.equal(kept.heard.find((line) => line.id === "h1")?.text, "Ton bleibt.");
  assert.equal(kept.heard.find((line) => line.id === "h2")?.name, "Ben");
  assert.equal(kept.decided.find((item) => item.id === "d1")?.by, "Ada");
  assert.equal(kept.decided.find((item) => item.id === "d1")?.title, "Ton");
  assert.equal(kept.decided.find((item) => item.id === "d2")?.by, "Ben");
});

test("a note without a name or a sentence does not enter the room", () => {
  assert.equal(noteGate("", "Ton bleibt"), "Trag zuerst deinen Namen ein.");
  assert.equal(noteGate("Gast", "Ton bleibt"), "Trag zuerst deinen Namen ein.");
  assert.equal(noteGate("Ada", "  "), "Die Zeile ist leer.");
  assert.equal(noteGate("Ada", "Ton bleibt"), "");
});

test("memory drops tags, huge stamps and an empty body", () => {
  const memory = fitMemory(
    {
      heard: [{ id: "h1", name: "Ada <b>", text: "Schnitt <i>", at: 1e15 }],
      tasks: [{ id: "t1", title: "Aufgabe", body: "offen", done: true, at: NOW }],
      now: "Szene",
    },
    NOW,
  );
  assert.equal(memory?.heard[0]?.name, "Ada b");
  assert.equal(memory?.heard[0]?.text, "Schnitt i");
  assert.equal(memory?.heard[0]?.at, NOW + 60_000);
  assert.equal(memory?.tasks[0]?.done, true);
  assert.equal(fitMemory({ decided: [{ id: "d1", title: "Ton <b>", by: "Ada <b>", at: NOW }] }, NOW)?.decided[0]?.title, "Ton b");
  assert.equal(fitMemory({ heard: [], cue: "" }, NOW), null);
});
