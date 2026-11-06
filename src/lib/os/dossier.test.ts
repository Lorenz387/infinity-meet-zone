import assert from "node:assert/strict";
import test from "node:test";
import { plainJob } from "./guard.ts";
import { compileDossier, dossierText, jobRooms } from "./dossier.ts";
import type { RoomMemory } from "./memory.ts";

const NOW = 1_700_000_000_000;

test("extra rooms stay clean and off the live code", () => {
  const job = plainJob(
    { id: "job-1", client: "Ada", room: "abcd", rooms: ["../EFGH", "abcd", "bad", "ijklmnop", "zzzz", "yyyy", "xxxx"] },
    NOW,
  );
  assert.deepEqual(job?.rooms, ["efgh", "ijklmnop", "zzzz", "yyyy"]);
  assert.deepEqual(jobRooms({ room: "ABCD", rooms: job?.rooms }), ["abcd", "efgh", "ijklmnop", "zzzz", "yyyy"]);
});

test("a dossier keeps both rooms and lets the later task win", () => {
  const live: RoomMemory = {
    heard: [{ id: "b", name: "Ben", text: "Fassung.", at: 200 }],
    tasks: [{ id: "t", title: "Schnitt", body: "", done: false, at: 200 }],
    covered: [],
    now: "Szene 2",
    cue: "morgen",
    job: "",
    begun: true,
    decided: [],
  };
  const past: RoomMemory = {
    heard: [{ id: "a", name: "Ada", text: "Rohschnitt bleibt.", at: 100 }],
    tasks: [
      { id: "t", title: "Schnitt", body: "", done: true, at: 50 },
      { id: "u", title: "Ton", body: "", done: true, at: 80 },
    ],
    covered: [{ id: "p", title: "Rohschnitt" }],
    now: "Begrüßung",
    cue: "",
    job: "",
    begun: true,
    decided: [{ id: "u", title: "Ton", by: "Ada", at: 80 }],
  };
  const dossier = compileDossier({ client: "Atelier Nord", line: "Schnitt", room: "demozone", rooms: ["altnord", "no"] }, { demozone: live, altnord: past, gone: null });
  assert.deepEqual(dossier.rooms, ["demozone", "altnord"]);
  assert.equal(dossier.now, "Szene 2");
  assert.deepEqual(dossier.covered.map((point) => point.title), ["Rohschnitt"]);
  assert.deepEqual(dossier.open.map((task) => task.title), ["Schnitt"]);
  assert.deepEqual(dossier.done.map((task) => task.title), ["Ton"]);
  assert.equal(dossier.last?.text, "Fassung.");
  assert.equal(dossier.cue, "morgen");
  assert.deepEqual(dossier.decided.map((item) => item.title), ["Ton"]);
  assert.deepEqual(dossier.people, ["Ben", "Ada"]);
  const text = dossierText({ client: "Atelier Nord", line: "Schnitt" }, dossier);
  assert.match(text, /Entschieden: Ton · Ada/);
  assert.match(text, /Dabei: Ben, Ada/);
  const stolen = compileDossier(
    { client: "Atelier Nord", line: "Schnitt", room: "demozone", rooms: ["altnord"] },
    {
      demozone: { ...live, decided: [{ id: "u", title: "Weg", by: "Ben", at: 300 }] },
      altnord: past,
    },
  );
  assert.equal(stolen.decided[0]?.by, "Ada");
  assert.equal(stolen.decided[0]?.title, "Ton");
  const corrected = compileDossier(
    { client: "Atelier Nord", line: "Schnitt", room: "demozone", rooms: ["altnord"] },
    {
      demozone: { ...live, decided: [{ id: "u", title: "Ton bleibt", by: "Ada", at: 300 }] },
      altnord: past,
    },
  );
  assert.equal(corrected.decided[0]?.by, "Ada");
  assert.equal(corrected.decided[0]?.title, "Ton bleibt");
  assert.equal(text.includes("erfunden"), false);
  const quiet = compileDossier({ client: "Atelier Nord", line: "Schnitt", room: "demozone", rooms: ["altnord"] }, { demozone: live, altnord: null });
  assert.equal(quiet.covered.length, 0);
  assert.equal(quiet.now, "Szene 2");
});
