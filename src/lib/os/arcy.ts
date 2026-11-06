import type { OsScale } from "@/lib/os/look";
import { isJobKind, type JobKind } from "@/lib/os/jobs";
import { keepNow } from "@/lib/os/keep";

export type AppId =
  | "arcy"
  | "tag"
  | "datei"
  | "seite"
  | "blaetter"
  | "runde"
  | "transkript"
  | "gedanke"
  | "einbinden"
  | "hub";

export type ArcyTone = "knapp" | "ruhig" | "direkt";

export type ArcyProfile = {
  address: string;
  tone: ArcyTone;
  note: string;
};

const KEY = "arc-arcy";

export const ARCY_DEFAULT: ArcyProfile = { address: "", tone: "knapp", note: "" };

export function loadProfile(): ArcyProfile {
  if (typeof window === "undefined") return ARCY_DEFAULT;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<ArcyProfile> | null;
    if (!raw) return ARCY_DEFAULT;
    const tone: ArcyTone = raw.tone === "ruhig" || raw.tone === "direkt" ? raw.tone : "knapp";
    return {
      address: String(raw.address || "").slice(0, 40),
      tone,
      note: String(raw.note || "").slice(0, 400),
    };
  } catch {
    return ARCY_DEFAULT;
  }
}

export function saveProfile(next: ArcyProfile) {
  const tone: ArcyTone = next.tone === "ruhig" || next.tone === "direkt" ? next.tone : "knapp";
  const profile: ArcyProfile = {
    address: next.address.trim().slice(0, 40),
    tone,
    note: next.note.trim().slice(0, 400),
  };
  keepNow(KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("arc-arcy"));
  return profile;
}

export function profileLines(profile = loadProfile()): string {
  const address = profile.address || "du";
  const note = profile.note || "keiner";
  return `Anrede: ${address}\nTon: ${profile.tone}\nMerkzettel: ${note}`;
}

const OPEN: { id: AppId; test: RegExp }[] = [
  { id: "tag", test: /\btag\b|tagesplan|laufplan|routine/ },
  { id: "seite", test: /\bseite\b|webseite/ },
  { id: "datei", test: /\bdatei\b|\bdateien\b/ },
  { id: "runde", test: /runde|zone|infinity|meeting|raum|call/ },
  { id: "transkript", test: /transkript|\bvideo\b|\bfilm\b/ },
  { id: "gedanke", test: /gedanke|gedanken/ },
  { id: "einbinden", test: /einbind|iframe|embed/ },
  { id: "hub", test: /\bhub\b|aufnahme/ },
  { id: "blaetter", test: /blatt|übersicht|protokoll/ },
  { id: "arcy", test: /\barcy\b|assistent|einstellung/ },
];

export function readCommand(raw: string): {
  open: AppId | null;
  scale?: OsScale;
  contrast?: boolean;
  aside?: boolean;
  note?: string;
  protocol?: string;
  job?: { client: string; kind: JobKind; line: string };
  slot?: { client: string; when?: string; place?: string; crewName?: string; crewRole?: string; sign?: string };
  handoff?: boolean;
  page?: string;
  cue?: string;
  thought?: string;
  flow?: { name: string; steps: string[] };
  flowNext?: boolean;
  carry?: boolean;
  together?: string;
  alone?: boolean;
  guide?: boolean;
  demo?: boolean;
  ask: boolean;
  reply: string;
} {
  const text = raw.toLowerCase().trim();
  if (!text) return { open: null, ask: false, reply: "Schreib Arcy, was er tun soll." };
  if (/^(führung|anleitung|hilfe)$/.test(text)) return { open: null, ask: false, guide: true, reply: "Die Führung liegt vorne." };
  if (/^demo(\s+laden)?$/.test(text)) return { open: null, ask: false, demo: true, reply: "Die Demo liegt auf dem Schreibtisch." };
  const noted = raw.trim().match(/^(?:notiz|merk)\s+(.+)$/i);
  if (noted?.[1]) return { open: null, ask: false, note: noted[1].slice(0, 180), reply: "Liegt auf dem Schreibtisch." };
  if (/^notiz$|^merk$/.test(text)) return { open: null, ask: false, reply: "Schreib hinter Notiz, was liegen soll." };
  const protocol = raw.trim().match(/^(?:protokoll|blatt)\s+(.+)$/i);
  if (protocol?.[1]) return { open: null, ask: false, protocol: protocol[1].slice(0, 48), reply: "Protokoll liegt auf dem Schreibtisch." };
  if (/^protokoll$|^blatt$/.test(text)) return { open: null, ask: false, protocol: "Schreibtisch", reply: "Protokoll liegt auf dem Schreibtisch." };
  const hired = raw.trim().match(/^auftrag\s+(\S+)(?:\s+(web|film|event|laden|dienst))?(?:\s+(.+))?$/i);
  if (hired?.[1]) {
    const rawKind = (hired[2] || "").toLowerCase();
    const kind: JobKind = isJobKind(rawKind) ? rawKind : "dienst";
    return {
      open: null,
      ask: false,
      job: { client: hired[1].slice(0, 40), kind, line: (hired[3] || "").slice(0, 160) },
      reply: "Auftrag liegt auf dem Schreibtisch.",
    };
  }
  if (/^auftrag$/.test(text)) return { open: null, ask: false, reply: "Schreib: Auftrag Müller Film Dreh am Freitag." };
  const timed = raw.trim().match(/^(?:zeit|um)\s+(\d{1,2})[:.](\d{2})\s+(\S+)$/i);
  if (timed) {
    const hour = Number(timed[1]);
    const minute = Number(timed[2]);
    if (hour > 23 || minute > 59) return { open: null, ask: false, reply: "Die Uhrzeit trägt nicht." };
    const when = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { open: "tag", ask: false, slot: { client: timed[3], when }, reply: `${timed[3]} steht um ${when}.` };
  }
  if (/^ort\b/i.test(raw.trim())) {
    const parts = raw.trim().split(/\s+/).slice(1);
    if (parts.length < 2) return { open: null, ask: false, reply: "Schreib: Ort Studio Müller." };
    return { open: "tag", ask: false, slot: { client: parts[parts.length - 1]!, place: parts.slice(0, -1).join(" ") }, reply: "Der Ort liegt auf dem Auftrag." };
  }
  if (/^crew\b/i.test(raw.trim())) {
    const parts = raw.trim().split(/\s+/).slice(1);
    if (parts.length < 2) return { open: null, ask: false, reply: "Schreib: Crew Kim Kamera Müller." };
    return {
      open: "tag",
      ask: false,
      slot: { client: parts[parts.length - 1]!, crewName: parts[0]!, crewRole: parts.slice(1, -1).join(" ") },
      reply: `${parts[0]} steht auf dem Auftrag.`,
    };
  }
  if (/^frei\b/i.test(raw.trim())) {
    const parts = raw.trim().split(/\s+/).slice(1);
    if (parts.length < 2) return { open: null, ask: false, reply: "Schreib: Frei Schnitt steht Müller." };
    return {
      open: "tag",
      ask: false,
      slot: { client: parts[parts.length - 1]!, sign: parts.slice(0, -1).join(" ") },
      reply: "Die Freigabe liegt auf dem Auftrag.",
    };
  }
  if (/^übergabe$|^uebergabe$/.test(text)) return { open: "tag", ask: false, handoff: true, reply: "Übergabe liegt auf dem Schreibtisch." };
  const site = raw.trim().match(/^(?:seite|web)\s+(\S+)$/i);
  if (site?.[1]) return { open: "seite", ask: false, page: site[1], reply: "Seite ist offen." };
  const burned = raw.trim().match(/^(?:einblendung|kamera)\s+(.+)$/i);
  if (burned?.[1]) return { open: null, ask: false, cue: burned[1].slice(0, 140), reply: "Der Satz liegt auf der Kamera." };
  if (/^einblendung$|^kamera$/.test(text)) return { open: null, ask: false, reply: "Schreib hinter Einblendung, was auf der Kamera stehen soll." };
  const thought = raw.trim().match(/^gedanke\s+(.+)$/i);
  if (thought?.[1]) return { open: "gedanke", ask: false, thought: thought[1].slice(0, 140), reply: "Der Gedanke liegt auf der Kamera." };
  if (/^gedanke$|^gedanken$/.test(text)) return { open: "gedanke", ask: false, reply: "Schreib: Gedanke wir starten jetzt." };
  if (/^nächster schritt$|^naechster schritt$/.test(text)) return { open: "gedanke", ask: false, flowNext: true, reply: "Der nächste Gedanke liegt auf der Kamera." };
  if (/^ablauf$/.test(text)) return { open: "gedanke", ask: false, reply: "Schreib: Ablauf Start | Wir starten jetzt | Kurze Pause" };
  const flow = raw.trim().match(/^ablauf\s+(.+)$/i);
  if (flow?.[1]) {
    const parts = flow[1].split("|").map((part) => part.trim()).filter(Boolean);
    const name = parts[0]?.slice(0, 40) || "";
    const steps = parts.slice(1).map((part) => part.slice(0, 140)).filter(Boolean).slice(0, 12);
    if (!name || steps.length === 0) return { open: "gedanke", ask: false, reply: "Schreib: Ablauf Start | Wir starten jetzt | Kurze Pause" };
    return { open: "gedanke", ask: false, flow: { name, steps }, reply: `Workflow ${name} liegt bereit. Der erste Gedanke ist auf der Kamera.` };
  }
  if (/^(mitnehmen|export)$/.test(text)) return { open: null, ask: false, carry: true, reply: "Die Datei infinity-meet-zone-export liegt bereit." };
  const together = raw.trim().match(/^gemeinsam\s+(\S+)$/i);
  if (together?.[1]) return { open: null, ask: false, together: together[1], reply: "Die Sitzung ist gemeinsam offen." };
  if (/^gemeinsam$/.test(text)) return { open: null, ask: false, reply: "Schreib: Gemeinsam studio." };
  if (/^allein$/.test(text)) return { open: null, ask: false, alone: true, reply: "Du arbeitest allein." };
  if (/^schreibtisch$|^beiseite$|^weglegen$/.test(text)) return { open: null, ask: false, aside: true, reply: "Liegt beiseite." };
  const short = text.split(/\s+/).length <= 3;
  const imperative = /^(öffne|oeffne|zeig|starte|hol)\b/.test(text);
  const open = imperative || short ? (OPEN.find((item) => item.test.test(text))?.id ?? null) : null;
  let scale: OsScale | undefined;
  if (/schrift\s*(groß|gross|größer|grosser)/.test(text)) scale = "large";
  else if (/lesbar|schrift\s*lesen/.test(text)) scale = "read";
  else if (/schrift\s*normal|schrift\s*zurück|schrift\s*zurueck/.test(text)) scale = "base";
  let contrast: boolean | undefined;
  if (/kontrast\s*(an|scharf|hoch)/.test(text)) contrast = true;
  else if (/kontrast\s*(aus|normal)/.test(text)) contrast = false;
  if (!open && scale === undefined && contrast === undefined) {
    return { open: null, ask: true, reply: "" };
  }
  const bits: string[] = [];
  if (open) bits.push("Fenster ist offen.");
  if (scale === "large") bits.push("Schrift ist groß.");
  if (scale === "read") bits.push("Schrift ist auf Lesen.");
  if (scale === "base") bits.push("Schrift ist normal.");
  if (contrast === true) bits.push("Kontrast ist scharf.");
  if (contrast === false) bits.push("Kontrast ist normal.");
  return { open, scale, contrast, ask: false, reply: bits.join(" ") };
}
