import assert from "node:assert/strict";
import test from "node:test";
import { packText } from "./pack-text.ts";

test("the readable export names only what was stored", () => {
  const text = packText({
    at: Date.parse("2026-11-06T12:00:00Z"),
    jobs: [],
    sessions: [{ room: "ada1", label: "Schnitt" }],
    talk: [],
    rooms: [
      {
        room: "ada1",
        memory: {
          now: "",
          cue: "",
          decided: [{ title: "Ton bleibt", by: "Ada" }],
          heard: [{ name: "Ada", text: "Wir bleiben beim Ton." }],
          tasks: [],
        },
      },
    ],
  });
  assert.match(text, /Akte ada1/);
  assert.match(text, /Entschieden: Ton bleibt · Ada/);
  assert.match(text, /Ada: Wir bleiben beim Ton\./);
  assert.match(text, /Offene Sitzungen/);
  assert.doesNotMatch(text, /Euro|gespart|Kunde sagt/);
});
