import { useEffect, useRef, useState } from "react";
import { lensBlock, lensDrop, lensTake } from "@/lib/meet/lens";
import { mediaError, openCamera } from "@/lib/meet/media";
import { getCue, setCue, subscribeCue } from "@/lib/os/cue";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { listThoughts, showThought, subscribeThoughts, type ThoughtVia } from "@/lib/os/thoughts";
import { addFlow, currentStep, listFlows, moveFlow, parseSteps, playFlow, removeFlow, subscribeFlows } from "@/lib/os/workflows";

const VIA: Record<ThoughtVia, string> = {
  zeigen: "Auf die Kamera",
  sagen: "Zuhören",
  weitergeben: "An alle",
};

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

function CameraFrame() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [text, setText] = useState("");
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const pull = () => setText(getCue());
    pull();
    return subscribeCue(pull);
  }, []);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let dead = false;
    const block = lensBlock("gedanke");
    if (block) {
      setErr(block);
      setOn(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("Dieser Browser gibt keine Kamera frei. Der Satz liegt trotzdem für das ausgehende Bild bereit.");
      return;
    }
    void openCamera()
      .then((track) => {
        if (dead || !track) {
          track?.stop();
          if (!dead) setErr("Keine Kamera an diesem Gerät. Der Satz liegt trotzdem für das ausgehende Bild bereit.");
          return;
        }
        const next = new MediaStream([track]);
        stream = next;
        lensTake("gedanke", track, () => {
          dead = true;
          track.stop();
          setOn(false);
        });
        if (videoRef.current) videoRef.current.srcObject = next;
        setErr("");
      })
      .catch((error) => setErr(`${mediaError(error)} Der Satz liegt trotzdem für das ausgehende Bild bereit.`));
    return () => {
      dead = true;
      lensDrop("gedanke");
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [on]);

  return (
    <div>
      <h3 className="font-display text-2xl text-paper">Digitale Kamera</h3>
      <p className="mt-1 text-sm text-mist">Der Balken ist derselbe Satz, der ins ausgehende Bild gebrannt wird. Höchstens zwei Zeilen.</p>
      <div className="relative mt-3 aspect-video overflow-hidden rounded-2xl bg-ink">
        {on ? <video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" /> : null}
        <p className="absolute left-3 top-3 text-xs text-mist">Digitale Kamera</p>
        <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-3 py-2 text-sm text-paper">{text || "Noch kein Gedanke auf der Kamera."}</p>
      </div>
      <button type="button" onClick={() => setOn((value) => !value)} className="mt-3 h-11 rounded-full border border-line px-4 text-sm text-paper">
        {on ? "Vorschau aus" : "Kamera zeigen"}
      </button>
      {err ? <p className="mt-2 text-sm text-copper">{err}</p> : null}
    </div>
  );
}

export function Thoughts() {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<ReturnType<typeof listThoughts>>([]);
  const [flows, setFlows] = useState<ReturnType<typeof listFlows>>([]);
  const [note, setNote] = useState("");
  const [hearing, setHearing] = useState(false);
  const [flowName, setFlowName] = useState("");
  const [flowSteps, setFlowSteps] = useState("");

  useEffect(() => {
    setDraft(getDraft("thought"));
    setFlowName(getDraft("flowName"));
    setFlowSteps(getDraft("flowSteps"));
    const pullThoughts = () => setItems(listThoughts());
    const pullFlows = () => setFlows(listFlows());
    pullThoughts();
    pullFlows();
    const stopThoughts = subscribeThoughts(pullThoughts);
    const stopFlows = subscribeFlows(pullFlows);
    return () => {
      stopThoughts();
      stopFlows();
    };
  }, []);

  function put(via: ThoughtVia, text = draft) {
    const saved = showThought(text, via);
    if (!saved) {
      setNote("Schreib zuerst den Gedanken.");
      return;
    }
    setDraft("");
    putDraft("thought", "");
    setNote(via === "weitergeben" ? "Liegt auf der Kamera, im Satz für alle und als Zettel." : "Liegt auf der Kamera.");
  }

  async function hear() {
    if (hearing) return;
    setHearing(true);
    setNote("Sprich den Gedanken.");
    try {
      const said = await listenOnce();
      if (!showThought(said, "sagen")) setNote("Es kam kein Satz an.");
      else {
        setDraft("");
        putDraft("thought", "");
        setNote("Der gesprochene Gedanke liegt auf der Kamera.");
      }
    } catch (error) {
      setNote(error instanceof Error && error.message === "none" ? "Dieser Browser hat keine Spracherkennung. Schreib den Gedanken ins Feld." : "Zuhören wurde abgebrochen.");
    } finally {
      setHearing(false);
    }
  }

  function makeFlow() {
    const made = addFlow(flowName, parseSteps(flowSteps));
    if (!made) {
      setNote("Der Workflow braucht einen Namen und mindestens einen Schritt.");
      return;
    }
    playFlow(made.id, "zeigen");
    setFlowName("");
    setFlowSteps("");
    putDraft("flowName", "");
    putDraft("flowSteps", "");
    setNote(`Workflow ${made.name} ist angelegt. Der erste Gedanke liegt auf der Kamera.`);
  }

  return (
    <section className="space-y-5 px-4 py-4">
      <p className="text-sm text-mist">Ein Gedanke geht auf die digitale Kamera. Ein Workflow ist die Folge mehrerer Gedanken, Schritt für Schritt.</p>
      <CameraFrame />
      <label className="block text-sm text-mist">
        Dein Gedanke
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            putDraft("thought", event.target.value);
          }}
          maxLength={140}
          placeholder="Wir starten jetzt"
          className="mt-2 h-11 w-full rounded-xl border border-line bg-panel px-3 text-paper"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => put("zeigen")} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
          Auf die Kamera
        </button>
        <button type="button" disabled={hearing} onClick={() => void hear()} className="h-11 rounded-full border border-line px-4 text-sm text-paper disabled:opacity-40">
          {hearing ? "Hört zu…" : "Zuhören"}
        </button>
        <button type="button" onClick={() => put("weitergeben")} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
          An alle
        </button>
      </div>
      {note ? <p className="text-sm text-copper">{note}</p> : null}
      <div>
        <h3 className="font-display text-2xl text-paper">Workflows</h3>
        <p className="mt-1 text-sm text-mist">Jeder Schritt ist ein Gedanke. Auf die Kamera legt den aktuellen Schritt ins Bild. Nächster Schritt geht weiter.</p>
        <label className="mt-3 block text-sm text-mist">
          Name
          <input
            value={flowName}
            onChange={(event) => {
              setFlowName(event.target.value);
              putDraft("flowName", event.target.value);
            }}
            maxLength={40}
            placeholder="Start"
            className="mt-2 h-11 w-full rounded-xl border border-line bg-panel px-3 text-paper"
          />
        </label>
        <label className="mt-3 block text-sm text-mist">
          Schritte
          <textarea
            value={flowSteps}
            onChange={(event) => {
              setFlowSteps(event.target.value);
              putDraft("flowSteps", event.target.value);
            }}
            rows={4}
            placeholder={"Wir starten jetzt\nKurze Pause\nWir machen weiter"}
            className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-paper"
          />
        </label>
        <button type="button" onClick={makeFlow} className="mt-3 h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
          Workflow anlegen
        </button>
        {flows.length === 0 ? <p className="mt-3 text-sm text-mist">Noch kein Workflow.</p> : null}
        <ul className="mt-3 space-y-3">
          {flows.map((flow) => (
            <li key={flow.id} className="rounded-2xl border border-line px-3 py-3">
              <p className="text-xs text-mist">
                {flow.name} · Schritt {flow.index + 1} von {flow.steps.length}
              </p>
              <p className="mt-1 text-sm text-paper">{currentStep(flow)}</p>
              <ol className="mt-2 space-y-1">
                {flow.steps.map((step, index) => (
                  <li key={`${flow.id}-${index}`} className={`text-sm ${index === flow.index ? "text-paper" : "text-mist"}`}>
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { playFlow(flow.id, "zeigen"); setNote("Liegt auf der Kamera."); }} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
                  Auf die Kamera
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (flow.index >= flow.steps.length - 1) {
                      playFlow(flow.id, "zeigen");
                      setNote("Das ist der letzte Schritt. Er liegt wieder auf der Kamera.");
                      return;
                    }
                    const moved = moveFlow(flow.id, "next");
                    if (moved) playFlow(moved.id, "zeigen");
                    setNote("Der nächste Gedanke liegt auf der Kamera.");
                  }}
                  className="h-11 rounded-full border border-line px-4 text-sm text-paper"
                >
                  Nächster Schritt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const moved = moveFlow(flow.id, "start");
                    if (moved) playFlow(moved.id, "zeigen");
                    setNote("Der erste Gedanke liegt wieder auf der Kamera.");
                  }}
                  className="h-11 rounded-full border border-line px-4 text-sm text-paper"
                >
                  Von vorn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playFlow(flow.id, "weitergeben");
                    setNote("Der Schritt liegt auf der Kamera, im Satz für alle und als Zettel.");
                  }}
                  className="h-11 rounded-full border border-line px-4 text-sm text-paper"
                >
                  Schritt an alle
                </button>
                <button type="button" onClick={() => removeFlow(flow.id)} className="h-11 px-3 text-sm text-mist">
                  Entfernen
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-2xl text-paper">Gespeicherte Gedanken</h3>
        {items.length === 0 ? <p className="mt-2 text-sm text-mist">Noch keiner.</p> : null}
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line px-3 py-2">
              <p className="text-xs text-mist">
                {VIA[item.via]} · {new Date(item.at).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </p>
              <p className="mt-1 text-sm text-paper">{item.text}</p>
              <button
                type="button"
                onClick={() => {
                  setCue(item.text);
                  setNote("Liegt wieder auf der Kamera.");
                }}
                className="mt-2 h-10 rounded-full border border-line px-3 text-sm text-paper"
              >
                Nochmal
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
