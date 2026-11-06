import { useEffect, useRef, useState } from "react";
import { askRunde } from "@/lib/meet/assistant";
import { blankFacts, lensBlock, lensDrop, lensReport, lensTake, lensWho, runCameraSweep } from "@/lib/meet/lens";
import { cleanName, listDevices, makeId, mediaError, openCamera } from "@/lib/meet/media";
import { loadProfile, profileLines } from "@/lib/os/arcy";
import { getDraft } from "@/lib/os/drafts";
import { useJobs } from "@/lib/os/jobs";
import { keepNow, readKept } from "@/lib/os/keep";
import { leaveNote, readRoomMemory } from "@/lib/os/memory-sync";
import { closeSession, daySeenKey, fitTalk, getSessions, learnSpoken, openSession, sessionBrief, talkKey, todayRoom, useSessions, type DayTurn } from "@/lib/os/sessions";
import { startVoice, stopVoice, useVoice } from "@/lib/os/voice";

type Fact = { people: string; last: string };

const GUIDE = [
  "Bis zu vier Sitzungen sind gleichzeitig offen. Ton und Bild liegen nur in einer, über Im Bild. Die anderen bleiben zum Schreiben offen.",
  "Heute ist die Tageszone dieses Tages. Sie öffnet sich einmal am Tag, wenn noch Platz ist.",
  "Kamera an in der Tageszone sieht nur Arcy. Das Bild geht nicht an die anderen und wird nicht gespeichert. Prüfung öffnet jedes gemeldete Bildgerät kurz, nennt was ankommt, und lässt es wieder los. Sie speichert nichts und schickt das Bild nicht.",
  "Schreiben legt eine Zeile in den gewählten Raum, ohne Kamera. Dafür braucht es den Namen aus Gemeinsam. Ein anderer Name überschreibt die Zeile nicht. Eine Entscheidung bleibt bei ihrem Namen.",
  "Die Akte liest gespeicherte Räume ohne Kamera. Frag die Akte fragt nur diesen Text. Text kopiert ihn.",
  "Acht Personen am Tisch, sechs mit Ton und Bild. Ohne direkte Verbindung der Netze kommt Ton und Bild nicht zustande.",
  "Auftrag, Demo, Führung, Gedanke und Zone sind Knöpfe auf diesem Schreibtisch. Kennen liest die offenen Sitzungen und merkt sich nur Gespeichertes. Keine Zahlung, kein Jira, kein Trello, kein Asana.",
].join(" ");

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function listenOnce(): Promise<string> {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new Error("none"));
  const rec = new Ctor();
  rec.lang = "de-DE";
  rec.interimResults = false;
  return new Promise((resolve, reject) => {
    rec.onresult = (event) => resolve(event.results[0]?.[0]?.transcript ?? "");
    rec.onerror = () => reject(new Error("fail"));
    rec.start();
  });
}

function watchPeer() {
  const existing = sessionStorage.getItem("arc-watch-peer");
  if (existing && /^[a-z0-9]{4,32}$/.test(existing)) return existing;
  const next = `w${makeId(8)}`;
  sessionStorage.setItem("arc-watch-peer", next);
  return next;
}

function who() {
  return getDraft("togetherName") || loadProfile().address || "";
}

function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const line = new SpeechSynthesisUtterance(text);
  line.lang = "de-DE";
  synth.speak(line);
}

function shot(video: HTMLVideoElement | null) {
  if (!video || video.readyState < 2 || !video.videoWidth) return "";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = Math.max(180, Math.round((video.videoHeight / video.videoWidth) * 320));
  const pen = canvas.getContext("2d");
  if (!pen) return "";
  pen.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "";
  return image.length > 180_000 ? "" : image;
}

export function Sessions() {
  const sessions = useSessions();
  const jobs = useJobs();
  const voice = useVoice();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState("");
  const [line, setLine] = useState("");
  const [said, setSaid] = useState("");
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [cam, setCam] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [tip, setTip] = useState("");
  const [turns, setTurns] = useState<DayTurn[]>([]);
  const [learned, setLearned] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const revs = useRef<Record<string, number>>({});
  const turnsRef = useRef<DayTurn[]>([]);
  const liveLeft = useRef(0);
  const busyRef = useRef(false);
  const learnedRef = useRef("");
  const sweepRef = useRef(false);
  const talkRef = useRef<(question: string, counting: boolean) => void>(() => {});

  const selected = sessions.some((session) => session.room === picked) ? picked : (sessions[0]?.room ?? "");
  const last = turns[turns.length - 1]?.text ?? "";

  useEffect(() => {
    const room = todayRoom();
    if (readKept(daySeenKey()) !== "1") {
      const error = openSession(room, "Tageszone");
      if (!error || error === "Die Sitzung ist schon offen.") keepNow(daySeenKey(), "1");
    }
    try {
      const kept = fitTalk(JSON.parse(readKept(talkKey()) || "[]"));
      turnsRef.current = kept;
      setTurns(kept);
    } catch {
      turnsRef.current = [];
    }
    setPicked(room);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const track = trackRef.current;
    if (video && track) {
      video.srcObject = new MediaStream([track]);
      void video.play().catch(() => {});
    }
  }, [cam]);

  useEffect(() => {
    return () => {
      trackRef.current?.stop();
      lensDrop("tageszone");
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const peer = watchPeer();
    const name = cleanName(who() || "Du");
    async function tick() {
      const current = getSessions();
      const next: Record<string, Fact> = {};
      const briefs: string[] = [];
      await Promise.all(
        current.map(async (session, index) => {
          const rev = revs.current[session.room] ?? 0;
          const [roster, memory] = await Promise.all([
            fetch(`/api/share?room=${session.room}&peer=${peer}&name=${encodeURIComponent(name)}&rev=${rev}`)
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null),
            readRoomMemory(session.room),
          ]);
          if (roster && typeof roster.rev === "number") revs.current[session.room] = roster.rev;
          const people = Array.isArray(roster?.people)
            ? roster.people.map((person: { name?: string }) => person.name).filter((item: string) => item && item !== name)
            : [];
          const heard = memory?.heard ?? [];
          const tail = heard[heard.length - 1];
          next[session.room] = {
            people: people.length ? people.join(" · ") : "Noch niemand sonst",
            last: tail ? `${tail.name}: ${tail.text}` : "",
          };
          briefs[index] = sessionBrief(session.label, session.room, memory, people.join(" · "));
        }),
      );
      if (!stop) {
        setFacts(next);
        const text = briefs.join("\n\n").slice(0, 4000);
        if (text !== learnedRef.current) {
          learnedRef.current = text;
          setLearned(text);
        }
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [sessions]);

  function remember(next: DayTurn[]) {
    const kept = fitTalk(next);
    turnsRef.current = kept;
    setTurns(kept);
    keepNow(talkKey(), JSON.stringify(kept));
  }

  function stopCam() {
    trackRef.current?.stop();
    trackRef.current = null;
    lensDrop("tageszone");
    if (videoRef.current) videoRef.current.srcObject = null;
    setCam(false);
    setLive(false);
  }

  async function talk(question: string, counting: boolean) {
    if (busyRef.current) return;
    if (counting) {
      if (liveLeft.current <= 0) {
        setLive(false);
        const text = "Live pausiert. Sag etwas oder drück nochmal Live.";
        setTip(text);
        speak(text);
        return;
      }
      liveLeft.current -= 1;
    }
    const asked = question.replace(/\s+/g, " ").trim().slice(0, 400);
    busyRef.current = true;
    setBusy(true);
    try {
      const open = jobs
        .filter((job) => job.status !== "fertig")
        .slice(0, 6)
        .map((job) => `${job.client}${job.line ? `: ${job.line}` : ""}`);
      const rooms = getSessions().map((session) => {
        const fact = facts[session.room];
        return `${session.label} (${session.room})${fact?.people ? `, ${fact.people}` : ""}${fact?.last ? `, zuletzt ${fact.last}` : ""}`;
      });
      const image = shot(videoRef.current);
      const prior = turnsRef.current.map((turn) => `${turn.who}: ${turn.text}`).join("\n");
      const picture = voice.cam
        ? "Die Meeting-Kamera ist in einem Gespräch. Dieses Bild hier ist keins."
        : image
          ? "Ein Bild der eigenen Kamera ist dabei. Es geht nicht an andere und wird nicht gespeichert."
          : "Kein Bild. Tu nicht so, als sähest du etwas.";
      if (asked) remember([...turnsRef.current, { who: "Du", text: asked }]);
      const result = await askRunde({
        data: {
          intent: "ask",
          context: [
            profileLines(),
            `Handbuch, nur diese Fakten:\n${GUIDE}`,
            open.length ? `Offene Aufträge:\n${open.join("\n")}` : "Keine offenen Aufträge.",
            rooms.length ? `Offene Sitzungen:\n${rooms.join("\n")}` : "Keine Sitzung offen.",
            learnedRef.current ? `Gelernt aus den Sitzungen, nur das:\n${learnedRef.current}` : "Die Sitzungen sind noch nicht gelesen.",
            voice.live ? `Ton und Bild liegen in ${voice.room}.` : "Ton und Bild sind in keiner Sitzung.",
            prior ? `Bisher heute:\n${prior}` : "",
            picture,
          ]
            .filter(Boolean)
            .join("\n\n"),
          question: asked
            ? `${asked}\nAntworte nur aus Handbuch, Schreibtisch, Bild und dem Block Gelernt. Was dort nicht steht, darfst du nicht behaupten.`
            : "Wenn ein Bild dabei ist, bezieh dich nur auf das Sichtbare. Sonst sag, dass kein Bild da ist. Danach ein konkreter Tipp aus dem Handbuch oder aus dem Block Gelernt. Erfinde keinen Gegenstand und keinen Zustand.",
          image: image || undefined,
        },
      });
      const text = result.ok ? result.text : result.error;
      setTip(text);
      if (result.ok) {
        remember([...turnsRef.current, { who: "Arcy", text: text.slice(0, 400) }]);
        speak(text);
      }
    } catch {
      setTip("Der Assistent ist nicht erreichbar.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  talkRef.current = (question, counting) => void talk(question, counting);

  useEffect(() => {
    if (!live || !cam) return;
    const timer = window.setInterval(() => talkRef.current("", true), 30_000);
    return () => window.clearInterval(timer);
  }, [live, cam]);

  async function pruefen() {
    if (sweepRef.current) return;
    const who = lensWho();
    if (who === "tageszone") stopCam();
    sweepRef.current = true;
    setSweeping(true);
    try {
      const text = await runCameraSweep({
        held: who === "tageszone" ? "" : who,
        list: async () => (await listDevices()).cams.map((cam) => ({ deviceId: cam.deviceId, label: cam.label })),
        open: openCamera,
      });
      setTip(text);
    } finally {
      sweepRef.current = false;
      setSweeping(false);
    }
  }

  async function hear() {
    if (busy || hearing) return;
    setHearing(true);
    try {
      const text = (await listenOnce()).replace(/\s+/g, " ").trim();
      setHearing(false);
      if (!text) {
        setTip("Ich habe nichts verstanden.");
        return;
      }
      void talk(text, false);
    } catch {
      setHearing(false);
      setTip("Zuhören geht gerade nicht. Schreib den Satz.");
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-panel p-4" aria-label="Sitzungen">
      <p className="text-xs text-copper">Tageszone</p>
      <p className="mt-1 max-w-lg text-sm text-paper">Arcy spricht mit dir und schaut nur hier. Das Bild geht nicht an die anderen. Live schaut ein paar Mal und gibt dann Ruhe.</p>
      {cam ? <video ref={videoRef} autoPlay muted playsInline className="mt-3 max-h-40 w-full max-w-xs -scale-x-100 rounded-2xl bg-ink object-cover" /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (cam) {
              stopCam();
              return;
            }
            if (voice.cam || lensWho() === "raum" || lensWho() === "stimme") {
              setTip("Die Kamera ist gerade im Gespräch. Dort sieht dich die Runde, nicht Arcy.");
              return;
            }
            const block = lensBlock("tageszone");
            if (block) {
              setTip(block);
              return;
            }
            void openCamera()
              .then((track) => {
                if (!track) {
                  setTip(lensReport(blankFacts("Kein Bildgerät gemeldet.")));
                  return;
                }
                track.onended = () => {
                  if (trackRef.current !== track) return;
                  stopCam();
                  setTip("Die Kamera hat aufgehört.");
                };
                trackRef.current = track;
                lensTake("tageszone", track, () => stopCam());
                setCam(true);
              })
              .catch((error) => setTip(lensReport(blankFacts(mediaError(error)))));
          }}
          className="h-11 rounded-full border border-line px-4 text-sm text-paper"
        >
          {cam ? "Kamera aus" : "Kamera an"}
        </button>
        <button type="button" disabled={busy} onClick={() => void talk("", false)} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink disabled:opacity-40">
          {busy ? "Schaut…" : "Schau"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (live) {
              setLive(false);
              return;
            }
            if (!cam) {
              setTip("Für Live zuerst die Kamera an.");
              return;
            }
            liveLeft.current = 4;
            setLive(true);
            void talk("", true);
          }}
          className="h-11 rounded-full border border-line px-4 text-sm text-paper"
        >
          {live ? "Ruhe" : "Live"}
        </button>
        <button
          type="button"
          onClick={() => {
            const spoken = learnSpoken(learnedRef.current ? learnedRef.current.split("\n\n") : []);
            setTip(spoken);
            speak(spoken);
            if (learnedRef.current) remember([...turnsRef.current, { who: "Arcy", text: spoken }]);
          }}
          className="h-11 rounded-full border border-line px-4 text-sm text-paper"
        >
          Kennen
        </button>
        <button type="button" disabled={sweeping} onClick={() => void pruefen()} className="h-11 rounded-full border border-line px-4 text-sm text-paper disabled:opacity-40">
          {sweeping ? "Prüft…" : "Prüfung"}
        </button>
      </div>
      {tip && tip !== last ? <p className="mt-2 max-w-lg whitespace-pre-wrap text-sm text-paper">{tip}</p> : null}
      {turns.length ? (
        <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto">
          {turns.map((turn, index) => (
            <li key={`${turn.who}-${index}`} className="text-sm">
              <span className="text-copper">{turn.who}. </span>
              <span className="text-paper">{turn.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = said;
          setSaid("");
          void talk(text, false);
        }}
      >
        <input value={said} onChange={(event) => setSaid(event.target.value)} placeholder="Sag Arcy etwas" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
        <button type="submit" disabled={busy || !said.trim()} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink disabled:opacity-40">
          Senden
        </button>
        <button type="button" disabled={busy || hearing} onClick={() => void hear()} className="h-11 rounded-full border border-line px-4 text-sm text-paper disabled:opacity-40">
          {hearing ? "Hört…" : "Sprechen"}
        </button>
      </form>

      <p className="mt-4 text-xs text-copper">Sitzungen</p>
      <p className="mt-1 max-w-lg text-sm text-mist">Bis zu vier Räume gleichzeitig, mit unterschiedlichen Personen. Ton und Bild sind in einem. Die anderen bleiben offen zum Schreiben. Kennen sagt nur, was in diesen Räumen gespeichert ist.</p>
      {learned ? <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-sm text-mist">{learned}</div> : null}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const error = openSession(code, label || code);
          setNote(error);
          if (!error) {
            setPicked(code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12));
            setCode("");
            setLabel("");
          }
        }}
      >
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Name" className="h-11 w-32 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" className="h-11 w-36 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
        <button type="submit" className="h-11 rounded-full border border-line px-4 text-sm text-paper">
          Sitzung
        </button>
        <button
          type="button"
          onClick={() => {
            const room = todayRoom();
            const error = openSession(room, "Tageszone");
            setNote(error);
            if (!error) setPicked(room);
          }}
          className="h-11 rounded-full border border-line px-4 text-sm text-paper"
        >
          Heute
        </button>
      </form>
      {note ? <p className="mt-2 text-sm text-copper">{note}</p> : null}
      {voice.note ? <p className="mt-2 text-sm text-copper">{voice.note}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {sessions.map((session) => {
          const fact = facts[session.room];
          const on = session.room === selected;
          const here = voice.live && voice.room === session.room;
          return (
            <article key={session.room} className={`min-w-0 rounded-2xl border p-3 ${on ? "border-copper" : "border-line"}`}>
              <button type="button" onClick={() => setPicked(session.room)} className="text-left">
                <p className="text-sm text-paper">{session.label}</p>
                <p className="text-sm text-mist">{session.room}</p>
                <p className="mt-1 text-sm text-paper">{fact?.people || "Wird gelesen."}</p>
                {fact?.last ? <p className="mt-1 text-sm text-mist">{fact.last}</p> : null}
                {here ? <p className="mt-1 text-sm text-copper">Ton und Bild nur hier.</p> : null}
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (here) return;
                    stopCam();
                    stopVoice();
                    void startVoice(session.room, who() || "Du");
                  }}
                  className="h-11 rounded-full bg-copper px-3 text-sm font-medium text-ink"
                >
                  {here ? "Bild hier" : "Im Bild"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const peer = watchPeer();
                    if (here) stopVoice();
                    closeSession(session.room);
                    void fetch("/api/share", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ op: "leave", room: session.room, peer }),
                    });
                  }}
                  className="h-11 rounded-full border border-line px-3 text-sm text-paper"
                >
                  Zu
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {selected ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void leaveNote(selected, who(), line).then((result) => {
              setNote(result.note);
              if (!result.note) setLine("");
            });
          }}
        >
          <input value={line} onChange={(event) => setLine(event.target.value)} placeholder={`Ohne Kamera in ${selected}`} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
          <button type="submit" className="h-11 rounded-full border border-line px-4 text-sm text-paper">
            Schreiben
          </button>
        </form>
      ) : null}
    </section>
  );
}
