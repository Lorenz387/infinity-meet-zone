import assert from "node:assert/strict";
import test from "node:test";
import { nextCode, suggestJob, type RoomJob } from "./room-fill.ts";

const quiet = { touched: false, joined: false, restored: false, imported: "" };

function job(partial: Partial<RoomJob> & Pick<RoomJob, "id" | "room" | "status" | "at">): RoomJob {
  return partial;
}

test("the job last set to running lends its code", () => {
  const older = job({ id: "a", room: "altcode", status: "läuft", at: 10, touch: { status: 10 } });
  const newer = job({ id: "b", room: "neuercode", status: "läuft", at: 20, touch: { status: 30 } });
  const idle = job({ id: "c", room: "anderes", status: "offen", at: 99 });
  assert.equal(suggestJob([older, idle, newer])?.id, "b");
  assert.deepEqual(nextCode({ ...quiet, code: "" }, [older, newer]), { code: "neuercode", imported: "neuercode" });
});

test("without a running job the newest room is used, and a short one is not", () => {
  const old = job({ id: "a", room: "altcode", status: "fertig", at: 10 });
  const young = job({ id: "b", room: "neucode", status: "offen", at: 20 });
  const tiny = job({ id: "c", room: "ab", status: "offen", at: 50 });
  assert.equal(suggestJob([old, tiny, young])?.id, "b");
  assert.equal(suggestJob([tiny]), null);
  assert.deepEqual(nextCode({ ...quiet, code: "" }, []), { code: "", imported: "" });
});

test("a typed code, a join, and a restored session stay put", () => {
  const running = job({ id: "a", room: "demozone", status: "läuft", at: 5, touch: { status: 5 } });
  assert.deepEqual(nextCode({ ...quiet, code: "eigen", imported: "" }, [running]), { code: "eigen", imported: "" });
  assert.deepEqual(nextCode({ ...quiet, code: "", joined: true }, [running]), { code: "", imported: "" });
  assert.deepEqual(nextCode({ ...quiet, code: "bleibt", restored: true }, [running]), { code: "bleibt", imported: "" });
  const filled = nextCode({ ...quiet, code: "" }, [running]);
  assert.deepEqual(nextCode({ ...quiet, code: "", touched: true, imported: filled.imported }, [running]), { code: "", imported: filled.imported });
  const moved = job({ id: "a", room: "schnitt", status: "läuft", at: 5, touch: { status: 9 } });
  assert.deepEqual(nextCode({ ...quiet, code: filled.code, imported: filled.imported }, [moved]), { code: "schnitt", imported: "schnitt" });
});
