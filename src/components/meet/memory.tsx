import { useEffect, useState } from "react";
import { askRunde } from "@/lib/meet/assistant";
import { memoryEmpty, type RoomMemory } from "@/lib/os/memory";
import { pullMemory, pushMemory } from "@/lib/os/memory-sync";

function pointWord(memory: RoomMemory) {
  if (memory.begun) return "Jetzt";
  if (memory.covered.length) return "Als Nächstes";
  return "Als Erstes";
}

function brief(memory: RoomMemory) {
  const lines: string[] = [];
  if (memory.job) lines.push(`Auftrag: ${memory.job}`);
  if (memory.covered.length) lines.push(`Durchgegangen: ${memory.covered.map((point) => point.title).join(", ")}`);
  if (memory.now) lines.push(`${pointWord(memory)}: ${memory.now}`);
  const open = memory.tasks.filter((task) => !task.done);
  const done = memory.tasks.filter((task) => task.done);
  if (open.length) lines.push(`Offen: ${open.map((task) => task.title).join("; ")}`);
  if (done.length) lines.push(`Erledigt: ${done.map((task) => task.title).join("; ")}`);
  for (const line of memory.heard.slice(-6)) lines.push(`${line.name}: ${line.text}`);
  if (memory.cue) lines.push(`Satz auf der Kamera: ${memory.cue}`);
  return lines.join("\n").slice(0, 4000);
}

export function RoomMemory({ room, live, place }: { room: string; live: boolean; place: "gate" | "camera" }) {
  const [memory, setMemory] = useState<RoomMemory | null>(null);
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    const take = (next: RoomMemory) => {
      if (!dead) setMemory(next);
    };
    void pullMemory(room).then(take);
    const timer = window.setInterval(() => {
      void pullMemory(room).then(take);
    }, 12000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, [room]);

  useEffect(() => {
    if (!live) return;
    let timer = 0;
    const send = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void pushMemory(room).then((next) => {
          if (next) setMemory(next);
        });
      }, 700);
    };
    send();
    window.addEventListener("arc-sheets", send);
    window.addEventListener("arc-agenda", send);
    window.addEventListener("arc-cue", send);
    window.addEventListener("arc-jobs", send);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("arc-sheets", send);
      window.removeEventListener("arc-agenda", send);
      window.removeEventListener("arc-cue", send);
      window.removeEventListener("arc-jobs", send);
    };
  }, [live, room]);

  const current = memory;
  const empty = !current || memoryEmpty(current);
  const box =
    place === "camera"
      ? "pointer-events-auto absolute left-3 top-9 z-20 max-h-28 w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-ink/95 px-3 py-2 shadow-lg"
      : "mt-4 rounded-2xl border border-line bg-ink px-3 py-3";
  const facts = place === "camera" ? "" : "max-h-28 overflow-y-auto";
  const chip = !current || empty ? "Bisher" : current.now ? `Bisher · ${pointWord(current)} ${current.now}` : "Bisher";

  async function ask(intent: "ask" | "actions", question: string) {
    if (!current || busy) return;
    setBusy(true);
    setNote("");
    try {
      const result = await askRunde({
        data: { intent, context: brief(current), question },
      });
      setNote(result.ok ? result.text : result.error);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={place === "camera" ? "absolute left-3 top-3 z-20 h-10 max-w-[70%] truncate rounded-full border border-line bg-ink/90 px-3 text-left text-sm text-paper" : "mt-4 h-10 max-w-full truncate rounded-full border border-line px-3 text-left text-sm text-paper"}>
        {chip}
      </button>
    );
  }

  return (
    <section className={box} aria-label="Bisher in diesem Raum">
      <div className="flex items-center gap-2">
        <p className="text-xs text-copper">Bisher in diesem Raum</p>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto h-8 rounded-full px-2 text-xs text-mist">
          Weglegen
        </button>
      </div>
      {empty || !current ? (
        <p className="mt-1 text-sm text-mist">Noch kein Verlauf. Was hier gesagt und abgehakt wird, bleibt für die nächste Person.</p>
      ) : (
        <div className={`mt-1 space-y-1 text-sm text-paper ${facts}`}>
          {current.job ? <p>Auftrag: {current.job}</p> : null}
          {current.now ? (
            <p>
              {pointWord(current)}: {current.now}
            </p>
          ) : null}
          {current.covered.length ? <p>Durchgegangen: {current.covered.map((point) => point.title).join(" · ")}</p> : null}
          {current.tasks.some((task) => !task.done) ? <p>Offen: {current.tasks.filter((task) => !task.done).map((task) => task.title).join(" · ")}</p> : null}
          {current.tasks.some((task) => task.done) ? <p className="text-mist">Erledigt: {current.tasks.filter((task) => task.done).map((task) => task.title).join(" · ")}</p> : null}
          {current.heard.slice(-3).map((line) => (
            <p key={line.id}>
              <span className="text-mist">{line.name}: </span>
              {line.text}
            </p>
          ))}
          {current.cue ? <p className="text-mist">Satz: {current.cue}</p> : null}
        </div>
      )}
      {!empty && current ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void ask("ask", "Fasse nur diesen Verlauf in einem Satz. Erfinde nichts.")} disabled={busy} className="h-9 rounded-full border border-line px-3 text-xs text-paper disabled:opacity-40">
            {busy ? "Fasst…" : "Arcy in einem Satz"}
          </button>
          <button type="button" onClick={() => void ask("actions", "")} disabled={busy} className="h-9 rounded-full border border-line px-3 text-xs text-paper disabled:opacity-40">
            Nächste Schritte
          </button>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm text-mist">{note}</p> : null}
    </section>
  );
}
