import type { AppId } from "@/lib/os/arcy";
import { pushAgenda } from "@/lib/os/agenda";
import { putDraft } from "@/lib/os/drafts";
import { addNote, exportNotes } from "@/lib/os/desk";
import { listFiles, putFile } from "@/lib/os/files";
import { addCrew, addJob, attachRoom, patchJob, setJobStatus, signJob } from "@/lib/os/jobs";
import { saveRoom } from "@/lib/meet/room-log";
import { loadReflection, pinRoutine, saveReflection } from "@/lib/os/routine";
import { joinShare } from "@/lib/os/share";
import { pushMemory, seedMemory } from "@/lib/os/memory-sync";
import { patchSheet, startProtocol } from "@/lib/os/sheets";
import { setCue } from "@/lib/os/cue";
import { listThoughts, showThought } from "@/lib/os/thoughts";
import { addFlow, listFlows } from "@/lib/os/workflows";

export const DEMO_ROOM = "demozone";
export const DEMO_PAST = "altnord";
export const DEMO_TASK = "Ich kümmere mich um den Schnitt der Szene.";
const DEMO_NOTE = "Demo: Liefertermin für Atelier Nord ist noch offen.";
const DEMO_THOUGHT = "Wir starten mit dem Schnitt.";
const DEMO_LINE = "Beispiel: den Schnitt von Atelier Nord ansehen.";
const FLAG = "arc-demo";

export type DemoStep = {
  id: string;
  label: string;
  text: string;
  open?: AppId;
  room?: boolean;
};

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "auftrag",
    label: "Auftrag",
    text: "Atelier Nord, Film, läuft. Uhrzeit, Schnittraum, Kim am Schnitt. Die Freigabe ist ein Beispiel.",
  },
  {
    id: "tag",
    label: "Tag",
    open: "tag",
    text: "Die Uhrzeit liegt auf dem Tag. Die Routine und die Reflexion sind Beispiele, keine Auswertung.",
  },
  {
    id: "gedanke",
    label: "Gedanke",
    open: "gedanke",
    text: "Der Satz liegt auf der Kamera. Der Workflow Schnittbesprechung hat drei Schritte.",
  },
  {
    id: "datei",
    label: "Datei",
    open: "datei",
    text: "schnittplan.txt liegt in diesem Browser. Sie geht nicht ins Netz.",
  },
  {
    id: "seite",
    label: "Seite",
    open: "seite",
    text: "Trag eine Adresse ein. Verbietet die Seite das Einbetten, bleibt das Feld leer.",
  },
  {
    id: "blatt",
    label: "Blätter",
    open: "blaetter",
    text: "Zwei Beispielsätze und eine Aufgabe. Sie liegt nur auf dem Protokoll.",
  },
  {
    id: "zusammen",
    label: "Zusammen",
    text: "Code demozone. Der Satz für alle ist der Kamera-Text. Ton und Bild brauchen eine direkte Verbindung.",
  },
  {
    id: "raum",
    label: "Raum",
    room: true,
    text: "Die Agenda ist schon da. Beitreten zeigt die Uhr und die Beteiligung aus den Beispielsätzen. Niemand spricht live.",
  },
  {
    id: "hub",
    label: "Hub",
    open: "hub",
    text: "80 und 30 sind Beispielzahlen zum Rechnen, kein Gehalt. Eine Aufnahme bleibt hier, höchstens zwei Minuten.",
  },
  {
    id: "transkript",
    label: "Transkript",
    open: "transkript",
    text: "Untertitel brauchen ein Mikrofon in diesem Browser. Die Demo schreibt keine Stimme.",
  },
  {
    id: "einbinden",
    label: "Einbinden",
    open: "einbinden",
    text: "Im Ausschnitt DEINCODE durch demozone ersetzen.",
  },
  {
    id: "arcy",
    label: "Arcy",
    open: "arcy",
    text: "„öffne Zone“ läuft ohne Anfrage. Alles andere fragt Arcy.",
  },
];

export function demoOn() {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function demoLive(code: string) {
  return code === DEMO_ROOM && demoOn();
}

function demoWhen(now = new Date()) {
  const plus = new Date(now.getTime() + 25 * 60_000);
  if (plus.getDate() !== now.getDate()) return "23:59";
  return `${String(plus.getHours()).padStart(2, "0")}:${String(plus.getMinutes()).padStart(2, "0")}`;
}

export async function loadDemo(name: string) {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // The example still lands in this browser.
  }
  const job = addJob({
    client: "Atelier Nord",
    kind: "film",
    line: "Schnitt der Gesprächsszene",
    room: DEMO_ROOM,
  });
  setJobStatus(job.id, "läuft");
  patchJob(job.id, { when: demoWhen(), place: "Schnittraum" });
  addCrew(job.id, "Kim", "Schnitt");
  signJob(job.id, "Demo", "Beispiel: Schnitt freigegeben");

  const sheet = startProtocol("Schnitt", DEMO_ROOM);
  const now = Date.now();
  patchSheet(sheet.id, (current) => ({
    ...current,
    title: "Schnitt",
    heard: [
      { id: "demo-ada", at: now - 60_000, name: "Ada (Demo)", text: DEMO_TASK },
      { id: "demo-ben", at: now - 30_000, name: "Ben (Demo)", text: "Ich schreibe die nächste Fassung." },
    ],
    cards: [
      {
        id: "task-demo-schnitt",
        at: now,
        kind: "task" as const,
        title: DEMO_TASK,
        body: "Ada (Demo)",
      },
      ...current.cards.filter((card) => card.id !== "task-demo-schnitt"),
    ].slice(0, 40),
  }));

  await pushAgenda(DEMO_ROOM, {
    points: [
      { id: "demo-begr", title: "Begrüßung", minutes: 5 },
      { id: "demo-szene", title: "Szene 2", minutes: 10 },
      { id: "demo-weiter", title: "Nächste Schritte", minutes: 5 },
    ],
    index: 0,
    startedAt: null,
  });

  saveRoom(DEMO_ROOM, {
    chat: [{ id: "demo-room", name: "Raum", text: "Beispielsätze. Niemand spricht live.", at: now, kind: "system" }],
    captions: [
      { id: "demo-ada", name: "Ada (Demo)", text: DEMO_TASK, at: now - 60_000 },
      { id: "demo-ben", name: "Ben (Demo)", text: "Ich schreibe die nächste Fassung.", at: now - 30_000 },
    ],
    ai: [],
    notes: "Beispiel. Keine Live-Stimme.",
  });

  if (!exportNotes().some((note) => note.text === DEMO_NOTE)) addNote(DEMO_NOTE);
  if (!listThoughts().some((thought) => thought.text === DEMO_THOUGHT)) showThought(DEMO_THOUGHT, "zeigen");
  else setCue(DEMO_THOUGHT);
  if (!listFlows().some((flow) => flow.name === "Schnittbesprechung")) {
    addFlow("Schnittbesprechung", ["Begrüßung", "Szene 2 ansehen", "Nächste Schritte"]);
  }
  pinRoutine(DEMO_LINE);
  const reflect = loadReflection();
  if (!reflect.did && !reflect.stuck && !reflect.next) {
    saveReflection({
      did: "Beispiel: die Szene ist gesichtet.",
      stuck: "Beispiel: der Ton ist noch nicht entschieden.",
      next: "Beispiel: morgen der Schnitt.",
    });
  }
  putDraft("rate", "80");
  putDraft("meetMinutes", "30");
  const files = await listFiles().catch(() => []);
  if (!files.some((file) => file.name === "schnittplan.txt")) {
    await putFile(new File(["Schnittplan, Beispiel\nSzene 2 ansehen\nTon noch offen\n"], "schnittplan.txt", { type: "text/plain" })).catch(() => undefined);
  }
  joinShare(DEMO_ROOM, name.trim() || "Du");
  attachRoom(job.id, DEMO_PAST);
  const then = Date.now() - 86_400_000;
  void seedMemory(DEMO_PAST, {
    heard: [{ id: "alt-ada", name: "Ada (Demo)", text: "Der Rohschnitt bleibt so.", at: then }],
    tasks: [{ id: "task-alt-ton", title: "Ton sichten", body: "Ada (Demo)", done: true, at: then }],
    covered: [{ id: "alt-roh", title: "Rohschnitt" }],
    now: "",
    cue: "",
    job: "Atelier Nord: Schnitt der Gesprächsszene",
    begun: true,
    decided: [{ id: "task-alt-ton", title: "Ton sichten", by: "Ada (Demo)", at: then }],
  });
  void pushMemory(DEMO_ROOM);
  window.dispatchEvent(new Event("arc-demo"));
}
