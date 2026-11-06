import assert from "node:assert/strict";
import test from "node:test";
import { mediaError, openCamera } from "./media.ts";

test("a refused ideal size falls back to any camera, a block does not", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let calls = 0;
  const track = { kind: "video", stop() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          calls += 1;
          const video = constraints.video;
          if (video && typeof video === "object") throw new DOMException("tight", "OverconstrainedError");
          return { getVideoTracks: () => [track, { kind: "video", stop() {} }] } as MediaStream;
        },
      },
    },
  });
  try {
    const opened = await openCamera();
    assert.equal(opened, track);
    assert.equal(calls, 2);
    await assert.rejects(
      openCamera("cam-1"),
      (error: unknown) => error instanceof DOMException && error.name === "OverconstrainedError",
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
  }
  assert.match(mediaError(new DOMException("no", "NotAllowedError")), /Zugriff blockiert/);
  assert.match(mediaError(new DOMException("no", "NotFoundError")), /Kein passendes Gerät/);
  assert.match(mediaError(new DOMException("no", "NotReadableError")), /belegt/);
});
