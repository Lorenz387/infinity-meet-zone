import assert from "node:assert/strict";
import test from "node:test";
import { addSession, fitSessions, fitTalk, learnSpoken, sessionBrief, talkKey, todayRoom } from "./sessions.ts";
import { EMPTY_MEMORY } from "./memory.ts";

test("a day room is stable and four sessions is the ceiling", () => {
  assert.equal(todayRoom(new Date(2026, 10, 6)), "tag20261106");
  const first = addSession([], "Demo Zone", "Atelier");
  assert.equal(first.error, "");
  assert.equal(first.list[0]?.room, "demozone");
  const again = addSession(first.list, "demozone", "Noch mal");
  assert.equal(again.error, "Die Sitzung ist schon offen.");
  let list = first.list;
  for (const room of ["nord", "sued", "west"]) {
    const next = addSession(list, room, room);
    assert.equal(next.error, "");
    list = next.list;
  }
  assert.equal(addSession(list, "ostx", "Ost").error, "Vier Sitzungen sind offen. Schließ eine, bevor eine neue dazu kommt.");
  assert.equal(fitSessions([...list, { room: "<nord>", label: "x" }]).length, 4);
  assert.equal(talkKey(new Date(2026, 10, 6)), "arc-day-talk-tag20261106");
  const talk = fitTalk([
    { who: "Gast", text: "weg" },
    { who: "Du", text: "  Wie bleibt eine zweite Sitzung offen?  " },
    ...Array.from({ length: 9 }, (_, index) => ({ who: index % 2 ? "Arcy" : "Du", text: `Satz ${index}` })),
  ]);
  assert.equal(talk.length, 8);
  assert.equal(talk[0]?.text, "Satz 1");
  assert.equal(talk.some((turn) => turn.text.includes("zweite Sitzung")), false);
  const empty = sessionBrief("Nord", "nordraum", EMPTY_MEMORY, "");
  assert.match(empty, /Gespeichert: nichts/);
  const full = sessionBrief("Tageszone", "tag20261106", {
    ...EMPTY_MEMORY,
    now: "Begrüßung",
    decided: [{ id: "t1", title: "Ton", by: "Ada", at: 1 }],
    heard: [{ id: "h1", name: "Ben", text: "Wir schneiden Szene 2.", at: 2 }],
  }, "Ada");
  assert.match(full, /Personen: Ada/);
  assert.match(full, /Entschieden: Ton · Ada/);
  assert.match(full, /Zuletzt: Ben: Wir schneiden Szene 2/);
  assert.match(learnSpoken([empty, full]), /nordraum/);
  assert.match(learnSpoken([empty, full]), /Jetzt: Begrüßung/);
});
