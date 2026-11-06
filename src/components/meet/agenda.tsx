import { useEffect, useState } from "react";
import { agendaLeft, asAgenda, pullAgenda, pushAgenda, readAgenda, type Agenda } from "@/lib/os/agenda";
import { getDraft } from "@/lib/os/drafts";
import { talkShares } from "@/lib/os/talk";

function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

export function AgendaEditor({ room, onCount }: { room: string; onCount?: (count: number) => void }) {
  const [agenda, setAgenda] = useState<Agenda>({ points: [], index: 0, startedAt: null });
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [note, setNote] = useState("");

  useEffect(() => {
    let dead = false;
    setAgenda(readAgenda(room));
    void pullAgenda(room).then((next) => {
      if (!dead) setAgenda(next);
    });
    return () => {
      dead = true;
    };
  }, [room]);

  useEffect(() => {
    onCount?.(agenda.points.length);
  }, [agenda.points.length, onCount]);

  async function addPoint() {
    const clean = title.trim().slice(0, 80);
    const span = Math.round(Number(minutes));
    if (!clean || span < 1 || span > 60) {
      setNote("Ein Punkt braucht einen Namen und 1 bis 60 Minuten.");
      return;
    }
    const next = asAgenda({
      ...readAgenda(room),
      points: [...readAgenda(room).points, { id: `p-${Date.now().toString(36)}`, title: clean, minutes: span }],
    });
    setAgenda(next);
    setTitle("");
    const ok = await pushAgenda(room, next);
    setNote(ok ? "" : "Der Punkt liegt hier. Die Leitung hat ihn nicht.");
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-mist">Ohne Punkt kein Start.</p>
      <div className="mt-2 flex gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Punkt" maxLength={80} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-sm text-paper" />
        <input value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/[^\d]/g, "").slice(0, 2))} placeholder="Minuten" inputMode="numeric" className="h-11 w-24 rounded-xl border border-line bg-ink px-3 text-sm text-paper" />
        <button type="button" onClick={() => void addPoint()} className="h-11 rounded-full border border-line px-3 text-sm text-paper">
          Hinzufügen
        </button>
      </div>
      {agenda.points.length ? (
        <ol className="mt-3 space-y-1">
          {agenda.points.map((point, index) => (
            <li key={point.id} className="text-sm text-paper">
              {index + 1}. {point.title} · {point.minutes} Minuten
            </li>
          ))}
        </ol>
      ) : null}
      {note ? <p className="mt-2 text-sm text-copper">{note}</p> : null}
    </div>
  );
}

export function AgendaBar({
  room,
  captions,
}: {
  room: string;
  captions: { name: string; text: string }[];
}) {
  const [agenda, setAgenda] = useState<Agenda>({ points: [], index: 0, startedAt: null });
  const [now, setNow] = useState(() => Date.now());
  const [task, setTask] = useState("");

  useEffect(() => {
    let dead = false;
    const pull = () => {
      void pullAgenda(room).then((next) => {
        if (!dead) setAgenda(next);
      });
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const onTask = (event: Event) => {
      const title = (event as CustomEvent<string>).detail;
      if (typeof title === "string" && title) setTask(title);
    };
    window.addEventListener("arc-task", onTask);
    return () => {
      dead = true;
      window.clearInterval(timer);
      window.clearInterval(tick);
      window.removeEventListener("arc-task", onTask);
    };
  }, [room]);

  const { point, left, over, total } = agendaLeft(agenda, now);
  const width = total ? Math.round((left / total) * 100) : 0;
  const shares = talkShares(captions);
  const last = agenda.index >= agenda.points.length - 1;
  const overMin = point && agenda.startedAt != null ? Math.floor(Math.max(0, now - agenda.startedAt - point.minutes * 60_000) / 60_000) : 0;
  const rate = Number(getDraft("rate").replace(",", "."));
  const overEuro = overMin > 0 && Number.isFinite(rate) && rate > 0 ? Math.round((rate * overMin) / 60) : null;

  async function advance() {
    if (!point || last) return;
    const next = { ...agenda, index: agenda.index + 1, startedAt: Date.now() };
    setAgenda(next);
    await pushAgenda(room, next);
  }

  if (!point) return null;

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-line bg-panel px-3 py-2 sm:mx-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-paper">
          {agenda.index + 1}. {point.title}
        </p>
        <p className={`tabular-nums text-sm ${over || left < 60_000 ? "text-copper" : "text-mist"}`}>{over ? "Zeit ist um" : clock(left)}</p>
        <button type="button" onClick={() => void advance()} disabled={last} className="h-10 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
          {last ? "Letzter Punkt" : "Nächster Punkt"}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink">
        <div className={`h-full ${over || left < 60_000 ? "bg-copper" : "bg-paper"}`} style={{ width: `${over ? 100 : width}%` }} />
      </div>
      {overMin > 0 ? (
        <p className="mt-2 text-sm text-copper">
          {overEuro != null
            ? `Überzogen um ${overMin} ${overMin === 1 ? "Minute" : "Minuten"}. Nach deiner Eingabe ${overEuro} €. Kein Gehalt wird angenommen.`
            : `Überzogen um ${overMin} ${overMin === 1 ? "Minute" : "Minuten"}. Im Hub kannst du Euro pro Stunde eintragen, sonst wird nichts gerechnet.`}
        </p>
      ) : null}
      {task ? <p className="mt-2 text-sm text-paper">Aufgabe: {task}. Sie liegt auf dem Protokoll. Erledigt setzt du dort. Jira, Trello und Asana sind nicht angeschlossen.</p> : null}
      {shares.length ? (
        <div className="mt-2">
          <p className="text-xs text-mist">Beteiligung. Gezählt wird, wer im Untertitel spricht. Stimmung wird nicht gemessen.</p>
          <ul className="mt-1 space-y-1">
            {shares.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-sm text-paper">
                <span className="w-24 truncate">{item.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                  <span className="block h-full bg-copper" style={{ width: `${item.share}%` }} />
                </span>
                <span className="w-16 text-right tabular-nums text-mist">
                  {item.share}% · {item.words}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
