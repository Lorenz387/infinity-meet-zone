const ALPH = "abcdefghijkmnpqrstuvwxyz23456789";

export function makeId(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPH[b % ALPH.length]!;
  return out;
}

export function cleanCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
}

export function cleanName(input: string): string {
  const name = input.replace(/\s+/g, " ").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 32);
  return name || "Gast";
}

export function initial(name: string): string {
  const ch = name.trim()[0];
  return (ch ?? "?").toUpperCase();
}

export function inviteUrl(code: string): string {
  const { origin, pathname } = window.location;
  const base = pathname.replace(/\/r\/[^/]+\/?$/, "").replace(/\/$/, "");
  return `${origin}${base}/r/${code}`;
}

let pendingAutostart: string | null = null;

export function armAutostart(code: string) {
  pendingAutostart = code;
  try {
    sessionStorage.setItem("runde-autostart", code);
  } catch {
    // private mode
  }
}

export function shouldAutostart(code: string) {
  if (pendingAutostart === code) return true;
  try {
    if (sessionStorage.getItem("runde-autostart") === code) {
      pendingAutostart = code;
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function clearAutostart() {
  pendingAutostart = null;
  try {
    sessionStorage.removeItem("runde-autostart");
  } catch {
    // ignore
  }
}

export function mediaError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Zugriff blockiert. Erlaube Kamera oder Mikrofon für diese Seite.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "Kein passendes Gerät gefunden.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "Das Gerät ist gerade belegt oder wurde abgebrochen.";
  }
  return "Gerät konnte nicht gestartet werden.";
}

export async function openMic(deviceId?: string): Promise<MediaStreamTrack | null> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  return stream.getAudioTracks()[0] ?? null;
}

function firstVideo(stream: MediaStream) {
  const [track, ...rest] = stream.getVideoTracks();
  for (const extra of rest) extra.stop();
  return track ?? null;
}

export async function openCamera(deviceId?: string): Promise<MediaStreamTrack | null> {
  const video = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    facingMode: deviceId ? undefined : "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    return firstVideo(stream);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (deviceId || (name !== "OverconstrainedError" && name !== "NotFoundError" && name !== "ConstraintNotSatisfiedError")) throw error;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    return firstVideo(stream);
  }
}

export async function openMicAndCamera(micId?: string, camId?: string) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: micId ? { exact: micId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        deviceId: camId ? { exact: camId } : undefined,
        facingMode: camId ? undefined : "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    return {
      audio: stream.getAudioTracks()[0] ?? null,
      video: firstVideo(stream),
    };
  } catch (first) {
    let audio: MediaStreamTrack | null = null;
    let video: MediaStreamTrack | null = null;
    let audioError: unknown = first;
    try {
      audio = await openMic(micId);
      audioError = null;
    } catch (error) {
      audioError = error;
    }
    try {
      video = await openCamera(camId);
    } catch (error) {
      if (!audio) throw audioError ?? error;
    }
    return { audio, video };
  }
}

type PrimedDevices = { audio: MediaStreamTrack | null; video: MediaStreamTrack | null; error: string };

let primed: Promise<PrimedDevices> | null = null;

export function primeCallDevices() {
  if (primed) return primed;
  primed = openMicAndCamera()
    .then((opened) => ({ audio: opened.audio, video: opened.video, error: "" }))
    .catch((error: unknown) => ({ audio: null, video: null, error: mediaError(error) }));
  return primed;
}

export function takePrimedDevices() {
  const pending = primed;
  primed = null;
  return pending;
}

export type DeviceLists = {
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

export async function listDevices(): Promise<DeviceLists> {
  if (!navigator.mediaDevices?.enumerateDevices) return { mics: [], cams: [], speakers: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    mics: all.filter((d) => d.kind === "audioinput"),
    cams: all.filter((d) => d.kind === "videoinput"),
    speakers: all.filter((d) => d.kind === "audiooutput"),
  };
}

export function deviceLabel(device: MediaDeviceInfo, index: number, fallback: string): string {
  return device.label.trim() || `${fallback} ${index + 1}`;
}

export function linkLabel(state: RTCPeerConnectionState): string | null {
  if (state === "connected") return null;
  if (state === "failed") return "Nicht erreichbar";
  if (state === "disconnected") return "Unterbrochen";
  if (state === "closed") return "Beendet";
  return "Verbindet…";
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
