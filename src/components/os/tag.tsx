import { useEffect, useState } from "react";
import {
  addCrew,
  byWhen,
  clearSign,
  dropCrew,
  handoffText,
  minutesOf,
  nextSlot,
  patchJob,
  signJob,
  useJobs,
  kindLabel,
  type Job,
} from "@/lib/os/jobs";
import { addNote } from "@/lib/os/desk";
import { RoutineDay } from "@/components/os/routine";

function spanLabel(seconds: number) {
  const sign = seconds < 0 ? "−" : "";
  const abs = Math.abs(seconds);
  const hour = Math.floor(abs / 3600);
  const minute = Math.floor((abs % 3600) / 60);
  const second = abs % 60;
  const body = hour ? `${hour}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}` : `${minute}:${String(second).padStart(2, "0")}`;
  return sign + body;
}

export function TagBoard({ who, onNow }: { who: string; onNow: (job: Job) => void }) {
  const jobs = useJobs();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const next = nextSlot(jobs, now);
  const nextMinute = next ? minutesOf(next.when) : null;
  const delta = nextMinute === null ? null : nextMinute * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
  const ordered = [...jobs].sort(byWhen);

  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-sm text-mist">Der Tag ordnet die Aufträge nach Uhrzeit. Die Routine wechselt mit der Tageszeit und dreht sich weiter. Namen bleiben in diesem Browser.</p>
      <RoutineDay />
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="tabular-nums text-sm text-mist">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
        {next && delta !== null ? (
          <>
            <p className="mt-2 font-display text-3xl text-paper">{spanLabel(delta)}</p>
            <p className="mt-1 text-sm text-paper">
              {delta >= 0 ? "Als Nächstes" : "Dran seit"} {next.when} · {next.client}
            </p>
            <button type="button" onClick={() => onNow(next)} className="mt-3 h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
              Jetzt
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-paper">Noch keine Uhrzeit. Setz sie an einem Auftrag.</p>
        )}
        <button
          type="button"
          onClick={() => {
            const text = handoffText(jobs);
            if (text) addNote(text);
          }}
          className="mt-3 h-10 rounded-full border border-line px-3 text-sm text-paper"
        >
          Übergabe
        </button>
      </div>
      {ordered.length === 0 ? <p className="text-sm text-mist">Noch kein Auftrag.</p> : null}
      {ordered.map((job) => (
        <article key={job.id} className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-xs text-mist">
            {kindLabel(job.kind)} · {job.status}
          </p>
          <h3 className="font-display text-2xl text-paper">{job.client}</h3>
          <form
            className="mt-3 flex flex-wrap gap-2"
            key={`${job.id}-${job.when}-${job.place}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              patchJob(job.id, { when: String(data.get("when") || ""), place: String(data.get("place") || "") });
            }}
          >
            <input name="when" type="time" defaultValue={job.when} className="h-11 rounded-full border border-line bg-ink px-3 text-sm text-paper" />
            <input name="place" defaultValue={job.place} placeholder="Ort" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
            <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
              Setzen
            </button>
          </form>
          {job.crew.length ? (
            <ul className="mt-3 space-y-1">
              {job.crew.map((person, index) => (
                <li key={`${person.name}-${index}`} className="flex items-center gap-2 text-sm text-paper">
                  <span className="min-w-0 flex-1 truncate">
                    {person.name}
                    {person.role ? ` · ${person.role}` : ""}
                  </span>
                  <button type="button" onClick={() => dropCrew(job.id, index)} className="h-10 shrink-0 text-sm text-mist">
                    Weg
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              addCrew(job.id, String(data.get("name") || ""), String(data.get("role") || ""));
              event.currentTarget.reset();
            }}
          >
            <input name="name" placeholder="Name" className="h-11 w-28 rounded-full border border-line bg-ink px-3 text-sm text-paper" />
            <input name="role" placeholder="Rolle" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-3 text-sm text-paper" />
            <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
              Dazu
            </button>
          </form>
          {job.sign ? (
            <p className="mt-3 text-sm text-paper">
              Frei: {job.sign.text} · {job.sign.by}
              <button type="button" onClick={() => clearSign(job.id)} className="ml-2 h-10 text-sm text-mist">
                Lösen
              </button>
            </p>
          ) : (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                signJob(job.id, who, String(data.get("sign") || ""));
                event.currentTarget.reset();
              }}
            >
              <input name="sign" placeholder="Was freigegeben ist" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
              <button type="submit" className="h-11 rounded-full bg-copper px-3 text-sm font-medium text-ink">
                Frei
              </button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
