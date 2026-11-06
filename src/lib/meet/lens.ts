import { mediaError } from "./media.ts";

export type LensWho = "tageszone" | "stimme" | "gedanke" | "hub" | "pruefung" | "raum";

const PLACE: Record<LensWho, string> = {
  tageszone: "in der Tageszone",
  stimme: "im Gespräch",
  gedanke: "in der digitalen Kamera",
  hub: "in der Aufnahme",
  pruefung: "in der Prüfung",
  raum: "im Raum",
};

type Hold = { who: LensWho; track: MediaStreamTrack | null; stop: () => void };

let hold: Hold | null = null;

function current() {
  if (hold?.track && hold.track.readyState === "ended") hold = null;
  return hold;
}

export function lensWho(): LensWho | "" {
  return current()?.who ?? "";
}

export function lensTrack() {
  return current()?.track ?? null;
}

export function lensPlace(who: LensWho | "") {
  return who ? PLACE[who] : "";
}

export function lensBlock(who: LensWho) {
  const live = current();
  if (!live || live.who === who) return "";
  return `Die Kamera läuft schon ${PLACE[live.who]}.`;
}

export function lensTake(who: LensWho, track: MediaStreamTrack | null, stop: () => void) {
  hold = { who, track, stop };
}

export function lensDrop(who: LensWho) {
  if (hold?.who === who) hold = null;
}

export function lensYield(names: LensWho[]) {
  const live = current();
  if (!live || !names.includes(live.who)) return;
  const stop = live.stop;
  hold = null;
  stop();
}

export type LensFacts = {
  place: string;
  label: string;
  ready: string;
  width: number;
  height: number;
  fps: number;
  facing: string;
  frame: boolean | null;
  error: string;
};

export function blankFacts(error: string): LensFacts {
  return { place: "", label: "", ready: "", width: 0, height: 0, fps: 0, facing: "", frame: false, error };
}

export function factsFromTrack(track: MediaStreamTrack, place: string, error: string, frame: boolean | null): LensFacts {
  const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
  return {
    place,
    label: track.label || "",
    ready: track.readyState || "",
    width: typeof settings.width === "number" ? settings.width : 0,
    height: typeof settings.height === "number" ? settings.height : 0,
    fps: typeof settings.frameRate === "number" ? settings.frameRate : 0,
    facing: typeof settings.facingMode === "string" ? settings.facingMode : "",
    frame,
    error,
  };
}

export function lensReport(facts: LensFacts) {
  const lines = ["Prüfung der Kamera."];
  if (facts.place) lines.push(`Läuft ${facts.place}.`);
  if (facts.error) lines.push(facts.error);
  const label = facts.label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (label) lines.push(`Gerät: ${label}.`);
  if (facts.width > 0 && facts.height > 0) {
    const fps = facts.fps > 0 ? `, ${Math.round(facts.fps)} Bilder/s` : "";
    const facing = facts.facing === "user" ? ", nach vorn" : facts.facing === "environment" ? ", nach hinten" : "";
    lines.push(`Bild: ${facts.width}×${facts.height}${fps}${facing}.`);
  }
  if (facts.ready === "live" || facts.ready === "ended" || facts.ready === "muted") {
    const word = facts.ready === "live" ? "läuft" : facts.ready === "ended" ? "beendet" : "stumm";
    lines.push(`Spur: ${word}.`);
  }
  if (facts.frame === true) lines.push("Ein Bild lässt sich lesen.");
  if (facts.frame === false) lines.push("Kein Bild gelesen.");
  return lines.join("\n");
}

export function readCameraFrame(track: MediaStreamTrack): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  let settled = false;
  const finish = (ok: boolean) => {
    if (settled) return ok;
    settled = true;
    video.srcObject = null;
    return ok;
  };
  return video
    .play()
    .then(
      () =>
        new Promise<boolean>((resolve) => {
          const done = () => resolve(finish(video.readyState >= 2 && video.videoWidth > 0));
          if (video.readyState >= 2 && video.videoWidth > 0) done();
          else {
            video.onloadeddata = done;
            window.setTimeout(done, 800);
          }
        }),
    )
    .catch(() => finish(false));
}

export type CameraName = { deviceId: string; label: string };

const SWEEP_MAX = 8;

function reportBody(facts: LensFacts) {
  return lensReport(facts).replace(/^Prüfung der Kamera\.\n?/, "");
}

export function sweepText(parts: string[], more = false) {
  const head = parts.length === 1 ? "Prüfung der Kameras. 1 Gerät." : `Prüfung der Kameras. ${parts.length} Geräte.`;
  const lines = [head, ...parts.map((part, index) => `Kamera ${index + 1}. ${part}`)];
  if (more) lines.push("Weitere Geräte werden nicht geöffnet.");
  return lines.join("\n");
}

function named(cams: CameraName[]) {
  const next: CameraName[] = [];
  const ids = new Set<string>();
  for (const cam of cams) {
    if (!cam.deviceId || ids.has(cam.deviceId)) continue;
    ids.add(cam.deviceId);
    next.push(cam);
  }
  return next;
}

function denied(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
}

export async function runCameraSweep(input: {
  held: LensWho | "";
  list: () => Promise<CameraName[]>;
  open: (deviceId?: string) => Promise<MediaStreamTrack | null>;
  frame?: (track: MediaStreamTrack) => Promise<boolean>;
}) {
  if (input.held && input.held !== "tageszone" && input.held !== "pruefung") {
    return `Prüfung der Kameras.\nDie Kamera läuft schon ${lensPlace(input.held)}. Kein Gerät wird dafür geöffnet.`;
  }
  const frame = input.frame ?? readCameraFrame;
  async function measure(deviceId: string | undefined, fallback: string) {
    let track: MediaStreamTrack | null = null;
    try {
      track = await input.open(deviceId);
      if (!track) return { text: reportBody(blankFacts("Kein Bildgerät gemeldet.")), stop: false };
      lensTake("pruefung", track, () => track?.stop());
      const facts = factsFromTrack(track, "", "", await frame(track));
      if (!facts.label && fallback) facts.label = fallback;
      return { text: reportBody(facts), stop: false };
    } catch (error) {
      return { text: reportBody(blankFacts(mediaError(error))), stop: denied(error) };
    } finally {
      track?.stop();
      lensDrop("pruefung");
    }
  }
  let listed: CameraName[] = [];
  let more = false;
  try {
    const all = named(await input.list());
    more = all.length > SWEEP_MAX;
    listed = all.slice(0, SWEEP_MAX);
  } catch {
    return sweepText([reportBody(blankFacts("Kein Bildgerät gemeldet."))]);
  }
  if (!listed.length) {
    const first = await measure(undefined, "");
    if (first.stop) return sweepText([first.text]);
    try {
      const all = named(await input.list());
      more = all.length > SWEEP_MAX;
      listed = all.slice(0, SWEEP_MAX);
    } catch {
      listed = [];
    }
    if (listed.length <= 1) return sweepText([first.text], more);
  }
  const parts: string[] = [];
  for (const cam of listed) {
    const result = await measure(cam.deviceId, cam.label);
    parts.push(result.text);
    if (result.stop) break;
  }
  return sweepText(parts, more);
}
