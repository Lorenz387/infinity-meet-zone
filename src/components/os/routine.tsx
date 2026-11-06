import { useEffect, useState } from "react";
import { getCue, setCue } from "@/lib/os/cue";
import { getDraft, putDraft } from "@/lib/os/drafts";
import {
  addRoutineLine,
  currentLine,
  lineDone,
  loadReflection,
  markLine,
  rotateLine,
  saveReflection,
  slotLabel,
  slotOf,
  type Reflection,
} from "@/lib/os/routine";

export function RoutineDay() {
  const [line, setLine] = useState("");
  const [done, setDone] = useState(false);
  const [reflect, setReflect] = useState<Reflection>({ did: "", stuck: "", next: "" });
  const [own, setOwn] = useState("");
  const slot = slotOf();

  useEffect(() => {
    const pull = () => {
      setLine(currentLine());
      setDone(lineDone());
      setReflect(loadReflection());
    };
    pull();
    setOwn(getDraft("routine"));
    window.addEventListener("arc-routine", pull);
    return () => window.removeEventListener("arc-routine", pull);
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-xs text-mist">Routine · {slotLabel(slot)}</p>
        <p className="mt-2 font-display text-2xl text-paper">{line || "Noch kein Satz."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markLine(!done)}
            className={`h-10 rounded-full px-3 text-sm ${done ? "bg-copper text-ink" : "border border-line text-paper"}`}
          >
            {done ? "Erledigt" : "Offen"}
          </button>
          <button
            type="button"
            onClick={() => {
              const previous = line;
              const next = rotateLine();
              if (!getCue() || getCue() === previous) setCue(next);
            }}
            className="h-10 rounded-full border border-line px-3 text-sm text-paper"
          >
            Nächste
          </button>
          <button type="button" onClick={() => setCue(line)} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
            Auf die Kamera
          </button>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addRoutineLine(slot, own);
            setOwn("");
            putDraft("routine", "");
          }}
        >
          <input
            value={own}
            onChange={(event) => {
              setOwn(event.target.value);
              putDraft("routine", event.target.value);
            }}
            placeholder="Eigener Satz für diese Zeit"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper"
          />
          <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
            Dazu
          </button>
        </form>
      </div>
      <form
        className="space-y-2 rounded-2xl border border-line bg-panel p-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveReflection(reflect);
        }}
      >
        <p className="text-xs text-mist">Reflexion · bleibt in diesem Browser</p>
        <label className="block text-sm text-mist">
          Was ist gelungen?
          <textarea
            value={reflect.did}
            onChange={(event) => {
              const next = { ...reflect, did: event.target.value };
              setReflect(next);
              saveReflection(next, new Date(), true);
            }}
            rows={2}
            className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <label className="block text-sm text-mist">
          Wo hing es?
          <textarea
            value={reflect.stuck}
            onChange={(event) => {
              const next = { ...reflect, stuck: event.target.value };
              setReflect(next);
              saveReflection(next, new Date(), true);
            }}
            rows={2}
            className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <label className="block text-sm text-mist">
          Was nimmst du mit?
          <textarea
            value={reflect.next}
            onChange={(event) => {
              const next = { ...reflect, next: event.target.value };
              setReflect(next);
              saveReflection(next, new Date(), true);
            }}
            rows={2}
            className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <button type="submit" className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
          Ablegen
        </button>
      </form>
    </div>
  );
}
