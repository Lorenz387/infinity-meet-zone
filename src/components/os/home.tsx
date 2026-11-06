import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { AppWindow, Brain, Captions, Clapperboard, Clock, FolderOpen, Globe, LayoutDashboard, Sparkles, Video } from "lucide-react";
import { Lobby } from "@/components/meet/lobby";
import { TranscribePanel } from "@/components/meet/transcribe-panel";
import { Mark } from "@/components/meet/mark";
import { askRunde } from "@/lib/meet/assistant";
import { loadProfile, profileLines, readCommand, saveProfile, type AppId, type ArcyProfile } from "@/lib/os/arcy";
import { addNote, forgetNote, loadDesk, saveDesk, useDeskNotes, type DeskWin } from "@/lib/os/desk";
import { JobAkte } from "@/components/os/akte";
import { addCrew, addJob, briefFor, forgetJob, handoffText, isJobKind, kindLabel, patchJob, setJobStatus, signJob, useJobs, type Job, type JobKind, type JobStatus } from "@/lib/os/jobs";
import { patchLook } from "@/lib/os/look";
import { forgetSheet, patchSheet, startProtocol, useSheets } from "@/lib/os/sheets";
import { setCue } from "@/lib/os/cue";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { flushSoon, getKeepNote, keepNow, readKept, subscribeKeep } from "@/lib/os/keep";
import { savePageUrl } from "@/lib/os/page";
import { FileDesk } from "@/components/os/files";
import { SessionBar } from "@/components/os/session";
import { Sessions } from "@/components/os/sessions";
import { Together } from "@/components/os/together";
import { downloadExport } from "@/lib/os/pack";
import { getShare, joinShare, leaveShare } from "@/lib/os/share";
import { PageFrame } from "@/components/os/page";
import { TagBoard } from "@/components/os/tag";
import { Thoughts } from "@/components/os/thoughts";
import { showThought } from "@/lib/os/thoughts";
import { addFlow, latestFlow, moveFlow, playFlow } from "@/lib/os/workflows";
import { Guide, guidePending, rememberGuide } from "@/components/os/guide";
import { DemoBar } from "@/components/os/demo-bar";
import { DEMO_STEPS, demoOn, loadDemo } from "@/lib/os/demo";
import { Hub } from "@/components/os/hub";
import type { ProtocolSheet, SheetCard } from "@/lib/os/types";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { THEME } from "@/lib/os/theme";

type Win = DeskWin;

const APPS: { id: AppId; label: string; icon: typeof Sparkles }[] = [
  { id: "arcy", label: "Arcy", icon: Sparkles },
  { id: "tag", label: "Tag", icon: Clock },
  { id: "datei", label: "Datei", icon: FolderOpen },
  { id: "seite", label: "Seite", icon: Globe },
  { id: "blaetter", label: "Blätter", icon: LayoutDashboard },
  { id: "runde", label: "Zone", icon: Video },
  { id: "transkript", label: "Transkript", icon: Captions },
  { id: "gedanke", label: "Gedanke", icon: Brain },
  { id: "einbinden", label: "Einbinden", icon: AppWindow },
  { id: "hub", label: "Hub", icon: Clapperboard },
];

const LABEL = Object.fromEntries(APPS.map((app) => [app.id, app.label])) as Record<AppId, string>;

function untilLabel(sheet: ProtocolSheet) {
  if (!sheet.pinUntil) return "Gerade";
  return `Fixiert bis ${new Date(sheet.pinUntil).toLocaleDateString("de-DE")}`;
}

function cardLine(card: SheetCard) {
  if (card.kind === "widget") return card.title;
  if (card.kind === "audit") return card.headline;
  if (card.kind === "task") return card.title;
  if (card.kind === "booking") return `Tisch in ${card.place}`;
  if (card.kind === "mail") return card.subject;
  return card.text;
}

function sheetBrief(sheet: ProtocolSheet) {
  const heard = sheet.heard.map((line) => `${line.name}: ${line.text}`).join("\n") || "(leer)";
  const cards = sheet.cards.slice(0, 6).map(cardLine).join("\n") || "(leer)";
  return `PROTOKOLL ${sheet.title} (${sheet.room})\nGEHÖRT:\n${heard}\nKARTEN:\n${cards}`.slice(0, 7000);
}

export function ArcHome() {
  const sheets = useSheets();
  const notes = useDeskNotes();
  const jobs = useJobs();
  const [wins, setWins] = useState<Win[]>([]);
  const [focus, setFocus] = useState<AppId | null>(null);
  const [booted, setBooted] = useState(false);
  const [wide, setWide] = useState(false);
  const [clock, setClock] = useState("");
  const [command, setCommand] = useState("");
  const [jobClient, setJobClient] = useState("");
  const [jobKind, setJobKind] = useState<JobKind>("dienst");
  const [jobLine, setJobLine] = useState("");
  const [status, setStatus] = useState("Arcy führt Fenster und Schrift aus. Alles andere fragt er.");
  const keepNote = useSyncExternalStore(subscribeKeep, getKeepNote, () => "");
  const [profile, setProfile] = useState<ArcyProfile>({ address: "", tone: "knapp", note: "" });
  const [origin, setOrigin] = useState("");
  const [lines, setLines] = useState<{ role: "user" | "arcy"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const [demo, setDemo] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const z = useRef(1);
  const drag = useRef<{ id: AppId; x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    document.title = THEME;
    setOrigin(window.location.origin);
    setProfile(loadProfile());
    const saved = loadDesk();
    if (saved.wins.length) {
      setWins(saved.wins);
      setFocus(saved.focus);
      z.current = Math.max(1, ...saved.wins.map((win) => win.z));
    }
    setBooted(true);
    setCommand(getDraft("command"));
    setJobClient(getDraft("jobClient"));
    const kind = getDraft("jobKind");
    if (isJobKind(kind)) setJobKind(kind);
    setJobLine(getDraft("jobLine"));
    if (guidePending()) setGuide(true);
    if (demoOn()) setDemo(true);
    try {
      const kept = JSON.parse(readKept("arc-arcy-lines") || "[]") as { role?: unknown; text?: unknown }[];
      if (Array.isArray(kept)) {
        setLines(
          kept
            .filter((row) => (row.role === "user" || row.role === "arcy") && typeof row.text === "string")
            .slice(-20)
            .map((row) => ({ role: row.role as "user" | "arcy", text: String(row.text).slice(0, 2000) })),
        );
      }
    } catch {
      // The desk still opens.
    }
    const tick = () => setClock(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const timer = window.setInterval(tick, 30_000);
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => {
      flushSoon();
      window.clearInterval(timer);
      media.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (!booted) return;
    saveDesk(wins, focus);
  }, [booted, wins, focus]);

  useEffect(() => {
    if (!booted) return;
    saveProfile(profile);
  }, [booted, profile]);

  useEffect(() => {
    if (!booted) return;
    keepNow("arc-arcy-lines", JSON.stringify(lines.slice(-20)));
  }, [booted, lines]);

  function openApp(id: AppId) {
    setWins((current) => {
      const found = current.find((win) => win.id === id);
      if (found) {
        z.current += 1;
        return current.map((win) => (win.id === id ? { ...win, z: z.current, aside: false } : win));
      }
      z.current += 1;
      const index = APPS.findIndex((app) => app.id === id);
      return [...current, { id, x: 28 + (index % 4) * 28, y: 24 + (index % 3) * 24, z: z.current, aside: false }];
    });
    setFocus(id);
  }

  function closeApp(id: AppId) {
    setWins((current) => current.filter((win) => win.id !== id));
    setFocus((current) => (current === id ? null : current));
  }

  function park(id?: AppId | null) {
    const target = id ?? focus;
    if (!target) return;
    setWins((current) => current.map((win) => (win.id === target ? { ...win, aside: true } : win)));
    setFocus((current) => (current === target ? null : current));
  }

  function parkAll() {
    setWins((current) => current.map((win) => ({ ...win, aside: true })));
    setFocus(null);
  }

  function showOnly(id: AppId) {
    setWins((current) => {
      z.current += 1;
      const rest = current.filter((win) => win.id !== id).map((win) => ({ ...win, aside: true }));
      const found = current.find((win) => win.id === id);
      const next = found ? { ...found, aside: false, z: z.current } : { id, x: 48, y: 48, z: z.current, aside: false };
      return [...rest, next];
    });
    setFocus(id);
  }

  function pickDemo(index: number) {
    setDemoStep(index);
    const step = DEMO_STEPS[index];
    if (!step?.open) {
      parkAll();
      return;
    }
    showOnly(step.open);
  }

  async function startDemo() {
    rememberGuide();
    setGuide(false);
    await loadDemo(profile.address.trim() || "Du");
    setDemo(true);
    setDemoStep(0);
    parkAll();
    setStatus("Demo geladen. Atelier Nord, Raum demozone. Alles Beispiel, nichts wird abgebucht.");
  }

  async function askArcy(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setLines((current) => [...current, { role: "user" as const, text: question }].slice(-24));
    setBusy(true);
    openApp("arcy");
    try {
      const result = await askRunde({
        data: {
          intent: "ask",
          question,
          context: `${profileLines()}\nOffene Fenster: ${wins.map((win) => LABEL[win.id]).join(", ") || "keine"}\nZettel: ${notes.map((note) => note.text).join(" | ") || "keine"}\n${sheets[0] ? sheetBrief(sheets[0]) : ""}`,
        },
      });
      setLines((current) => [...current, { role: "arcy" as const, text: result.ok ? result.text : result.error }].slice(-24));
      setStatus(result.ok ? "Arcy hat geantwortet." : result.error);
    } catch {
      setLines((current) => [...current, { role: "arcy" as const, text: "Die Anfrage ist fehlgeschlagen." }].slice(-24));
    } finally {
      setBusy(false);
    }
  }

  function begin(title: string) {
    const sheet = startProtocol(title);
    setStatus(`Protokoll ${sheet.title} liegt auf dem Schreibtisch.`);
  }

  function addLine(sheet: ProtocolSheet, text: string) {
    const clean = text.trim().slice(0, 240);
    if (!clean) return;
    patchSheet(sheet.id, (current) => ({
      ...current,
      heard: [...current.heard, { id: `d-${Date.now().toString(36)}`, at: Date.now(), name: profile.address.trim() || "Du", text: clean }].slice(-8),
    }));
    setStatus("Satz liegt auf dem Protokoll und geht mit in den Raum.");
  }

  function addTask(sheet: ProtocolSheet) {
    const last = sheet.heard[sheet.heard.length - 1];
    const title = (last?.text || sheet.title).slice(0, 140);
    patchSheet(sheet.id, (current) => ({
      ...current,
      cards: [{ id: `task-${Date.now().toString(36)}`, at: Date.now(), kind: "task" as const, title, body: "Vom Schreibtisch." }, ...current.cards].slice(0, 40),
    }));
    setStatus("Aufgabe liegt auf dem Protokoll.");
  }

  async function writeAi(sheet: ProtocolSheet, intent: "summary" | "reply") {
    if (busy) return;
    setBusy(true);
    setStatus(intent === "summary" ? "Arcy fasst das Protokoll." : "Arcy schreibt eine Antwort.");
    try {
      const result = await askRunde({
        data: {
          intent,
          question: intent === "reply" ? "eine kurze Wortmeldung zum letzten Stand" : "",
          context: `${profileLines()}\n${sheetBrief(sheet)}`,
        },
      });
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      patchSheet(sheet.id, (current) => ({
        ...current,
        cards: [{ id: `ai-${Date.now().toString(36)}`, at: Date.now(), kind: "note" as const, text: result.text.slice(0, 500) }, ...current.cards].slice(0, 40),
      }));
      setStatus(intent === "summary" ? "Fassung liegt auf dem Protokoll." : "Antwort liegt auf dem Protokoll.");
    } catch {
      setStatus("Die Anfrage ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function run(text: string) {
    const result = readCommand(text);
    if (result.scale || typeof result.contrast === "boolean") {
      patchLook({ ...(result.scale ? { scale: result.scale } : {}), ...(typeof result.contrast === "boolean" ? { contrast: result.contrast } : {}) });
    }
    if (result.note) addNote(result.note);
    if (result.protocol) begin(result.protocol);
    if (result.job) takeJob(result.job.client, result.job.kind, result.job.line);
    if (result.slot && !applySlot(result.slot)) {
      setStatus(`Keinen Auftrag namens ${result.slot.client}.`);
      if (result.open) openApp(result.open);
      return;
    }
    if (result.handoff) {
      const text = handoffText(jobs);
      if (text) addNote(text);
      else {
        setStatus("Noch kein Auftrag für die Übergabe.");
        if (result.open) openApp(result.open);
        return;
      }
    }
    if (result.page) {
      const saved = savePageUrl(result.page);
      if (!saved) {
        setStatus("Die Adresse trägt nicht.");
        return;
      }
    }
    if (result.cue) setCue(result.cue);
    if (result.thought) showThought(result.thought, "zeigen");
    if (result.flow) {
      const made = addFlow(result.flow.name, result.flow.steps);
      if (made) playFlow(made.id, "zeigen");
    }
    if (result.flowNext) {
      const current = latestFlow();
      if (!current) {
        setStatus("Noch kein Workflow. Schreib: Ablauf Start | Wir starten jetzt | Kurze Pause");
        openApp("gedanke");
        return;
      }
      const last = current.index >= current.steps.length - 1;
      const moved = last ? current : moveFlow(current.id, "next");
      if (moved) playFlow(moved.id, "zeigen");
      openApp("gedanke");
      setStatus(last ? "Das war der letzte Schritt. Er liegt wieder auf der Kamera." : result.reply);
      return;
    }
    if (result.carry) {
      void downloadExport()
        .then((text) => setStatus(text))
        .catch(() => setStatus("Die Datei konnte nicht gespeichert werden."));
    }
    if (result.alone) leaveShare();
    if (result.together) {
      joinShare(result.together, loadProfile().address || "Gast");
      if (!getShare().room) {
        setStatus("Der Code braucht mindestens 4 Zeichen.");
        return;
      }
    }
    if (result.guide) setGuide(true);
    if (result.demo) {
      void startDemo();
      return;
    }
    if (result.aside) park();
    if (result.open) openApp(result.open);
    if (result.ask) {
      void askArcy(text);
      return;
    }
    setStatus(result.reply);
  }

  function applySlot(slot: { client: string; when?: string; place?: string; crewName?: string; crewRole?: string; sign?: string }) {
    const key = slot.client.toLowerCase();
    const job = jobs.find((item) => item.client.toLowerCase() === key) ?? jobs.find((item) => item.client.toLowerCase().startsWith(key));
    if (!job) return false;
    if (slot.when !== undefined) patchJob(job.id, { when: slot.when });
    if (slot.place !== undefined) patchJob(job.id, { place: slot.place });
    if (slot.crewName) addCrew(job.id, slot.crewName, slot.crewRole || "");
    if (slot.sign) signJob(job.id, profile.address.trim() || "Du", slot.sign);
    return true;
  }

  function nowJob(job: Job) {
    const sheet = startProtocol(job.client, job.room);
    patchSheet(sheet.id, (current) => ({
      ...current,
      heard: [...current.heard, { id: `d-${Date.now().toString(36)}`, at: Date.now(), name: profile.address.trim() || "Du", text: `${job.when || "Jetzt"} ${job.client} ist dran.`.slice(0, 240) }].slice(-8),
    }));
    if (job.status !== "fertig") setJobStatus(job.id, "läuft");
    setCue(`${job.when || "Jetzt"} ${job.client} ist dran.`.slice(0, 140));
    setStatus(`${job.client} ist dran.`);
  }

  function takeJob(client: string, kind: JobKind, line: string) {
    const name = client.trim().slice(0, 40);
    if (!name) return;
    const sheet = startProtocol(name);
    addJob({ client: name, kind, line, room: sheet.room });
    setStatus(`Auftrag ${name} liegt auf dem Schreibtisch.`);
  }

  function stepJob(job: Job) {
    const sheet = startProtocol(job.client, job.room);
    const title = (job.line || job.client).slice(0, 140);
    patchSheet(sheet.id, (current) => ({
      ...current,
      cards: [{ id: `task-${Date.now().toString(36)}`, at: Date.now(), kind: "task" as const, title, body: kindLabel(job.kind) }, ...current.cards].slice(0, 40),
    }));
    if (job.status === "offen") setJobStatus(job.id, "läuft");
    setStatus("Nächster Schritt liegt auf dem Auftrag.");
  }

  async function laufzettel(job: Job) {
    if (busy) return;
    const sheet = startProtocol(job.client, job.room);
    setBusy(true);
    setStatus("Arcy schreibt den Laufzettel.");
    try {
      const result = await askRunde({
        data: { intent: "summary", question: briefFor(job), context: `${profileLines()}\n${sheetBrief(sheet)}` },
      });
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      patchSheet(sheet.id, (current) => ({
        ...current,
        cards: [{ id: `ai-${Date.now().toString(36)}`, at: Date.now(), kind: "note" as const, text: result.text.slice(0, 500) }, ...current.cards].slice(0, 40),
      }));
      if (job.status === "offen") setJobStatus(job.id, "läuft");
      setStatus("Laufzettel liegt auf dem Auftrag.");
    } catch {
      setStatus("Die Anfrage ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function onTitleDown(event: ReactPointerEvent, id: AppId) {
    if (!wide) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const win = wins.find((item) => item.id === id);
    if (!win) return;
    drag.current = { id, x: win.x, y: win.y, px: event.clientX, py: event.clientY };
    openApp(id);
    const move = (next: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const x = Math.max(8, current.x + next.clientX - current.px);
      const y = Math.max(8, current.y + next.clientY - current.py);
      setWins((list) => list.map((item) => (item.id === current.id ? { ...item, x, y } : item)));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const shown = wins.filter((win) => (wide ? !win.aside : win.id === focus && !win.aside));
  const jobRooms = new Set(jobs.map((job) => job.room));
  const live = sheets.filter((sheet) => !sheet.pinUntil && !jobRooms.has(sheet.room)).slice(0, 2);
  const account = useCurrentUserState();

  return (
    <div className="studio flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:gap-3 sm:px-4">
        <Mark className="size-9 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-display text-base leading-none text-paper sm:text-xl">{THEME}</p>
          <p className="hidden text-xs text-mist sm:block">Arcy</p>
        </div>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const text = command.trim();
            if (!text) return;
            setCommand("");
            putDraft("command", "");
            run(text);
          }}
        >
          <label className="sr-only" htmlFor="arcy-command">
            Befehl an Arcy
          </label>
          <input
            id="arcy-command"
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              putDraft("command", event.target.value);
            }}
            placeholder="Auftrag Müller Film Dreh am Freitag"
            className="h-11 w-full rounded-full border border-line bg-panel px-4 text-sm text-paper outline-none placeholder:text-mist"
          />
        </form>
        <p className="hidden tabular-nums text-sm text-mist md:block">{clock}</p>
        <button type="button" onClick={() => void startDemo()} className="h-11 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
          Demo
        </button>
        <button type="button" onClick={() => setGuide(true)} className="h-11 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
          Führung
        </button>
        {account.user ? <UserButton /> : account.isPending ? null : (
          <Link to="/login" className="grid h-11 shrink-0 place-items-center rounded-full border border-line px-3 text-sm text-paper">
            Konto
          </Link>
        )}
      </header>
      <p className="border-b border-line px-4 py-2 text-sm text-mist">{status}</p>
      {keepNote ? <p className="border-b border-line px-4 py-2 text-sm text-copper">{keepNote}</p> : null}
      {demo ? <DemoBar index={demoStep} onPick={pickDemo} /> : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
          <h1 className="font-display text-4xl text-paper sm:text-5xl">Der Schreibtisch</h1>
          <p className="mt-3 max-w-lg text-mist">Ein Auftrag ist ein Kunde und eine Arbeit. Der Tag hält Routine und Reflexion. Die Sitzung lässt sich auf einen anderen Rechner mitnehmen.</p>
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Rechtliches">
            <Link to="/impressum" className="text-paper underline-offset-4 hover:underline">Impressum</Link>
            <Link to="/datenschutz" className="text-paper underline-offset-4 hover:underline">Datenschutz</Link>
            <Link to="/login" className="text-paper underline-offset-4 hover:underline">Konto</Link>
          </nav>
          <SessionBar onStatus={setStatus} />
          <Together />
          <Sessions />
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!jobClient.trim()) return;
              takeJob(jobClient, jobKind, jobLine);
              setJobClient("");
              setJobLine("");
              putDraft("jobClient", "");
              putDraft("jobLine", "");
            }}
          >
            <label className="sr-only" htmlFor="job-client">Kunde</label>
            <input
              id="job-client"
              value={jobClient}
              onChange={(event) => {
                setJobClient(event.target.value);
                putDraft("jobClient", event.target.value);
              }}
              placeholder="Kunde"
              className="h-11 w-36 rounded-full border border-line bg-panel px-4 text-sm text-paper"
            />
            <label className="sr-only" htmlFor="job-kind">Art</label>
            <select
              id="job-kind"
              value={jobKind}
              onChange={(event) => {
                const next = event.target.value;
                if (!isJobKind(next)) return;
                setJobKind(next);
                putDraft("jobKind", next);
              }}
              className="h-11 rounded-full border border-line bg-panel px-3 text-sm text-paper"
            >
              <option value="web">Web</option>
              <option value="film">Film</option>
              <option value="event">Event</option>
              <option value="laden">Laden</option>
              <option value="dienst">Dienst</option>
            </select>
            <label className="sr-only" htmlFor="job-line">Was ansteht</label>
            <input
              id="job-line"
              value={jobLine}
              onChange={(event) => {
                setJobLine(event.target.value);
                putDraft("jobLine", event.target.value);
              }}
              placeholder="Was ansteht"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm text-paper"
            />
            <button type="submit" className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
              Auftrag
            </button>
          </form>
          {live.length === 0 && jobs.length === 0 ? (
            <button type="button" onClick={() => begin("Schreibtisch")} className="mt-4 h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
              Protokoll anlegen
            </button>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                sheet={sheets.find((sheet) => sheet.room === job.room && !sheet.pinUntil)}
                busy={busy}
                onStatus={(status) => setJobStatus(job.id, status)}
                onStep={() => stepJob(job)}
                onSlip={() => void laufzettel(job)}
                onNow={() => nowJob(job)}
                onForget={() => forgetJob(job.id)}
              />
            ))}
            {live.map((sheet) => (
              <ProtocolCard key={sheet.id} sheet={sheet} busy={busy} onLine={addLine} onTask={addTask} onAi={(item, intent) => void writeAi(item, intent)} />
            ))}
            {sheets
              .filter((sheet) => sheet.pinUntil)
              .slice(0, 4)
              .map((sheet) => (
                <button key={sheet.id} type="button" onClick={() => openApp("blaetter")} className="rounded-2xl border border-line bg-panel p-3 text-left">
                  <p className="text-xs text-mist">Blatt</p>
                  <p className="mt-1 text-sm text-paper">{sheet.title}</p>
                </button>
              ))}
            {notes.map((note) => (
              <article key={note.id} className="rounded-2xl border border-line bg-panel p-3">
                <p className="text-sm text-paper">{note.text}</p>
                <button type="button" onClick={() => forgetNote(note.id)} className="mt-2 h-10 text-sm text-mist">
                  Weg
                </button>
              </article>
            ))}
          </div>
        </div>
        {shown.map((win) => (
          <section
            key={win.id}
            className={wide ? "absolute flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-ink" : "absolute inset-0 flex flex-col bg-ink"}
            style={wide ? { left: win.x, top: win.y, zIndex: win.z, height: "min(36rem, calc(100% - 1.5rem))" } : { zIndex: win.z }}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3" onPointerDown={(event) => onTitleDown(event, win.id)}>
              <h2 className="min-w-0 truncate font-display text-xl text-paper">{LABEL[win.id]}</h2>
              <button type="button" onClick={() => park(win.id)} className="ml-auto h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
                Beiseite
              </button>
              <button type="button" onClick={() => closeApp(win.id)} className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
                Schließen
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AppBody
                id={win.id}
                sheets={sheets}
                profile={profile}
                setProfile={setProfile}
                lines={lines}
                busy={busy}
                onAsk={(text) => void askArcy(text)}
                origin={origin}
                who={profile.address.trim() || "Du"}
                onNow={nowJob}
                onOpen={openApp}
              />
            </div>
          </section>
        ))}
      </div>
      <nav className="pad-safe flex flex-wrap gap-1 border-t border-line px-2 py-2" aria-label="Fenster">
        {APPS.map((app) => {
          const Icon = app.icon;
          const open = wins.some((win) => win.id === app.id);
          const aside = wins.some((win) => win.id === app.id && win.aside);
          const front = focus === app.id && !aside;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => (front ? park(app.id) : openApp(app.id))}
              className={`flex h-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 text-xs ${front ? "bg-copper text-ink" : aside ? "border border-line text-mist" : open ? "bg-raised text-paper" : "text-paper"}`}
            >
              <Icon className="size-4" />
              {app.label}
            </button>
          );
        })}
      </nav>
      {guide ? (
        <Guide
          onClose={() => setGuide(false)}
          onDemo={() => {
            setGuide(false);
            void startDemo();
          }}
        />
      ) : null}
    </div>
  );
}

function JobCard({
  job,
  sheet,
  busy,
  onStatus,
  onStep,
  onSlip,
  onNow,
  onForget,
}: {
  job: Job;
  sheet?: ProtocolSheet;
  busy: boolean;
  onStatus: (status: JobStatus) => void;
  onStep: () => void;
  onSlip: () => void;
  onNow: () => void;
  onForget: () => void;
}) {
  const statuses: JobStatus[] = ["offen", "läuft", "fertig"];
  return (
    <article className="col-span-2 rounded-2xl border border-line bg-panel p-4 sm:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-mist">
            {kindLabel(job.kind)} · {job.room}
          </p>
          <h2 className="font-display text-2xl text-paper">{job.client}</h2>
        </div>
        <Link to="/r/$code" params={{ code: job.room }} className="grid h-10 shrink-0 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
          Raum
        </Link>
      </div>
      <p className="mt-2 text-sm text-paper">{job.line || "Noch ohne Satz."}</p>
      {job.when || job.place ? <p className="mt-1 text-sm text-mist">{[job.when, job.place].filter(Boolean).join(" · ")}</p> : null}
      {job.crew.length ? <p className="mt-1 text-sm text-mist">{job.crew.map((person) => (person.role ? `${person.name} ${person.role}` : person.name)).join(" · ")}</p> : null}
      {job.sign ? <p className="mt-1 text-sm text-paper">Frei: {job.sign.text} · {job.sign.by}</p> : null}
      {sheet?.cards[0] ? <p className="mt-1 text-sm text-mist">{cardLine(sheet.cards[0])}</p> : null}
      <JobAkte job={job} />
      <div className="mt-3 flex flex-wrap gap-2">
        {statuses.map((status) => (
          <button key={status} type="button" onClick={() => onStatus(status)} className={`h-10 rounded-full px-3 text-sm ${job.status === status ? "bg-copper text-ink" : "border border-line text-paper"}`}>
            {status === "offen" ? "Offen" : status === "läuft" ? "Läuft" : "Fertig"}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onStep} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
          Schritt
        </button>
        {job.when ? (
          <button type="button" onClick={onNow} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
            Jetzt
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={onSlip} className="h-10 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
          Laufzettel
        </button>
        <button type="button" onClick={onForget} className="h-10 px-3 text-sm text-mist">
          Weg
        </button>
      </div>
    </article>
  );
}

function ProtocolCard({
  sheet,
  busy,
  onLine,
  onTask,
  onAi,
}: {
  sheet: ProtocolSheet;
  busy: boolean;
  onLine: (sheet: ProtocolSheet, text: string) => void;
  onTask: (sheet: ProtocolSheet) => void;
  onAi: (sheet: ProtocolSheet, intent: "summary" | "reply") => void;
}) {
  const [line, setLine] = useState("");
  useEffect(() => {
    setLine(getDraft(`proto:${sheet.id}`));
  }, [sheet.id]);
  const last = sheet.heard[sheet.heard.length - 1];
  return (
    <article className="col-span-2 rounded-2xl border border-line bg-panel p-4 sm:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-mist">Protokoll · {sheet.room}</p>
          <h2 className="font-display text-2xl text-paper">{sheet.title}</h2>
        </div>
        <Link to="/r/$code" params={{ code: sheet.room }} className="grid h-10 shrink-0 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
          Raum
        </Link>
      </div>
      {last ? (
        <p className="mt-2 text-sm text-paper">
          {last.name}: {last.text}
        </p>
      ) : (
        <p className="mt-2 text-sm text-mist">Noch kein Satz.</p>
      )}
      {sheet.cards.slice(0, 2).map((card) => (
        <p key={card.id} className="mt-1 text-sm text-mist">
          {cardLine(card)}
        </p>
      ))}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onLine(sheet, line);
          setLine("");
          putDraft(`proto:${sheet.id}`, "");
        }}
      >
        <input
          value={line}
          onChange={(event) => {
            setLine(event.target.value);
            putDraft(`proto:${sheet.id}`, event.target.value);
          }}
          placeholder="Satz ins Protokoll"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
        <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
          Dazu
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onTask(sheet)} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
          Aufgabe
        </button>
        <button type="button" disabled={busy} onClick={() => onAi(sheet, "reply")} className="h-10 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
          Antwort
        </button>
        <button type="button" disabled={busy} onClick={() => onAi(sheet, "summary")} className="h-10 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
          Fassen
        </button>
      </div>
    </article>
  );
}

function AppBody({
  id,
  sheets,
  profile,
  setProfile,
  lines,
  busy,
  onAsk,
  origin,
  who,
  onNow,
  onOpen,
}: {
  id: AppId;
  sheets: ProtocolSheet[];
  profile: ArcyProfile;
  setProfile: (next: ArcyProfile) => void;
  lines: { role: "user" | "arcy"; text: string }[];
  busy: boolean;
  onAsk: (text: string) => void;
  origin: string;
  who: string;
  onNow: (job: Job) => void;
  onOpen: (id: AppId) => void;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(getDraft("arcyAsk"));
  }, []);
  if (id === "arcy") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="space-y-3 border-b border-line px-4 py-4">
          <p className="text-sm text-mist">Anrede, Ton und Merkzettel gelten auf dem Schreibtisch und in {THEME}. Sie bleiben in diesem Browser.</p>
          <label className="block text-sm text-mist">
            Wie er dich nennt
            <input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} placeholder="du" className="mt-2 h-11 w-full rounded-xl border border-line bg-panel px-3 text-paper" />
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["knapp", "Knapp"],
                ["ruhig", "Ruhig"],
                ["direkt", "Direkt"],
              ] as const
            ).map(([tone, label]) => (
              <button key={tone} type="button" onClick={() => setProfile({ ...profile, tone })} className={`h-10 rounded-full px-3 text-sm ${profile.tone === tone ? "bg-copper text-ink" : "border border-line text-paper"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="block text-sm text-mist">
            Merkzettel
            <textarea value={profile.note} onChange={(event) => setProfile({ ...profile, note: event.target.value })} rows={3} placeholder="Was Arcy im Kopf behalten soll" className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-paper" />
          </label>
          <button
            type="button"
            onClick={() => setProfile(saveProfile(profile))}
            className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink"
          >
            So merken
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {lines.length === 0 ? <p className="text-sm text-mist">Frag ihn etwas, das kein Fenster öffnet. Befehle wie „öffne Zone“ laufen ohne Anfrage.</p> : null}
          {lines.map((line, index) => (
            <p key={`${line.role}-${index}`} className={`rounded-2xl px-3 py-2 text-sm ${line.role === "user" ? "bg-raised text-mist" : "bg-panel text-paper"}`}>
              {line.text}
            </p>
          ))}
          {busy ? <p className="text-sm text-mist">Arcy antwortet…</p> : null}
        </div>
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onAsk(draft);
            setDraft("");
            putDraft("arcyAsk", "");
          }}
        >
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              putDraft("arcyAsk", event.target.value);
            }}
            placeholder="Frag Arcy"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm text-paper"
          />
          <button type="submit" disabled={busy} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink disabled:opacity-40">
            Senden
          </button>
        </form>
      </div>
    );
  }
  if (id === "tag") return <TagBoard who={who} onNow={onNow} />;
  if (id === "gedanke") return <Thoughts />;
  if (id === "datei") return <FileDesk />;
  if (id === "seite") return <PageFrame />;
  if (id === "blaetter") {
    const pinned = sheets.filter((sheet) => sheet.pinUntil);
    const open = sheets.filter((sheet) => !sheet.pinUntil);
    return (
      <div className="space-y-3 px-4 py-4">
        <p className="text-sm text-mist">Was ein Gespräch zurücklässt. Fixierte Blätter bleiben einen Tag oder einen Monat.</p>
        <button type="button" onClick={() => onOpen("runde")} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
          {THEME} öffnen
        </button>
        {open.length === 0 && pinned.length === 0 ? <p className="text-sm text-mist">Noch kein Blatt.</p> : null}
        {[...open, ...pinned].map((sheet) => (
          <article key={sheet.id} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl text-paper">{sheet.title}</h3>
                <p className="text-sm text-mist">{untilLabel(sheet)}</p>
              </div>
              {sheet.pinUntil ? (
                <button type="button" onClick={() => forgetSheet(sheet.id)} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
                  Lösen
                </button>
              ) : (
                <Link to="/r/$code" params={{ code: sheet.room }} className="grid h-10 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
                  Zurück
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (id === "runde") return <Lobby nested />;
  if (id === "transkript") return <TranscribePanel />;
  if (id === "hub") return <Hub />;
  const snippet = `<iframe\n  src="${origin}/embed/r/DEINCODE"\n  allow="camera; microphone; display-capture; autoplay"\n  style="width:100%;height:720px;border:0"\n></iframe>`;
  return (
    <section className="px-4 py-4">
      <p className="text-sm text-mist">Der Raum lässt sich in ein anderes Fenster setzen. Ereignisse kommen als arc-os.</p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-line bg-panel p-4 text-sm text-paper">{snippet}</pre>
      <p className="mt-3 text-sm text-mist">
        Befehle vom Host: set-look, copy-context.{" "}
        <Link to="/embed/r/$code" params={{ code: "arcraum" }} className="text-copper">
          Vorschau
        </Link>
      </p>
    </section>
  );
}
