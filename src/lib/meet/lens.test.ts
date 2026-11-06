import assert from "node:assert/strict";
import test from "node:test";
import { blankFacts, factsFromTrack, lensBlock, lensDrop, lensReport, lensTake, lensWho, lensYield, runCameraSweep } from "./lens.ts";

function live(ready = "live") {
  return {
    label: "Studio Cam",
    readyState: ready,
    getSettings: () => ({ width: 640, height: 480, frameRate: 30, facingMode: "user" }),
  } as MediaStreamTrack;
}

test("one camera, and the report says only what was measured", () => {
  let stopped = 0;
  lensTake("tageszone", live(), () => {
    stopped += 1;
  });
  assert.equal(lensBlock("gedanke"), "Die Kamera läuft schon in der Tageszone.");
  assert.equal(lensBlock("tageszone"), "");
  lensYield(["gedanke"]);
  assert.equal(stopped, 0);
  assert.equal(lensWho(), "tageszone");
  lensYield(["tageszone", "gedanke"]);
  assert.equal(stopped, 1);
  assert.equal(lensWho(), "");

  const ended = live("ended");
  lensTake("raum", ended, () => {});
  assert.equal(lensBlock("tageszone"), "");
  lensDrop("raum");

  const text = lensReport(factsFromTrack(live(), "in der Tageszone", "", true));
  assert.match(text, /Prüfung der Kamera/);
  assert.match(text, /Läuft in der Tageszone/);
  assert.match(text, /Gerät: Studio Cam/);
  assert.match(text, /Bild: 640×480, 30 Bilder\/s, nach vorn/);
  assert.match(text, /Spur: läuft/);
  assert.match(text, /Ein Bild lässt sich lesen/);

  const fail = lensReport(blankFacts("Zugriff blockiert. Erlaube Kamera oder Mikrofon für diese Seite."));
  assert.equal(fail.includes("Gerät"), false);
  assert.equal(fail.includes("Bild:"), false);
  assert.match(fail, /Kein Bild gelesen/);
  assert.equal(fail.includes("Person"), false);
});

test("every listed camera is opened, and a live call is left alone", async () => {
  const opened: string[] = [];
  const track = (label: string, facing: string) =>
    ({
      label,
      readyState: "live",
      stop() {},
      getSettings: () => ({ width: 640, height: 480, frameRate: 15, facingMode: facing }),
    }) as MediaStreamTrack;
  const text = await runCameraSweep({
    held: "",
    list: async () => [
      { deviceId: "a", label: "Studio" },
      { deviceId: "a", label: "doppelt" },
      { deviceId: "b", label: "" },
      { deviceId: "c", label: "Rückseite" },
    ],
    open: async (id) => {
      opened.push(id || "");
      if (id === "c") throw new DOMException("weg", "NotFoundError");
      return track(id === "a" ? "Studio" : "Cam B", id === "b" ? "environment" : "user");
    },
    frame: async () => true,
  });
  assert.deepEqual(opened, ["a", "b", "c"]);
  assert.match(text, /Prüfung der Kameras\. 3 Geräte/);
  assert.match(text, /Kamera 1\. Gerät: Studio/);
  assert.match(text, /nach vorn/);
  assert.match(text, /Kamera 2\. Gerät: Cam B/);
  assert.match(text, /nach hinten/);
  assert.match(text, /Kamera 3\. Kein passendes Gerät/);
  assert.equal(text.includes("Person"), false);
  assert.equal(lensWho(), "");

  let called = false;
  const blocked = await runCameraSweep({
    held: "raum",
    list: async () => [{ deviceId: "a", label: "Studio" }],
    open: async () => {
      called = true;
      return null;
    },
  });
  assert.equal(called, false);
  assert.match(blocked, /läuft schon im Raum/);
  assert.match(blocked, /Kein Gerät wird dafür geöffnet/);

  const seen: string[] = [];
  let lists = 0;
  const revealed = await runCameraSweep({
    held: "",
    list: async () => {
      lists += 1;
      return lists === 1
        ? []
        : [
            { deviceId: "front", label: "Vorn" },
            { deviceId: "back", label: "Hinten" },
          ];
    },
    open: async (id) => {
      seen.push(id || "default");
      return track("Gemessen", "user");
    },
    frame: async () => false,
  });
  assert.deepEqual(seen, ["default", "front", "back"]);
  assert.match(revealed, /2 Geräte/);
  assert.match(revealed, /Kein Bild gelesen/);
  assert.equal(revealed.includes("Kamera 3"), false);
});
