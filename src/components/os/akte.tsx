import { useEffect, useState } from "react";
import { askRunde } from "@/lib/meet/assistant";
import { loadProfile } from "@/lib/os/arcy";
import { compileDossier, dossierText, jobRooms } from "@/lib/os/dossier";
import { getDraft } from "@/lib/os/drafts";
import { attachRoom, detachRoom, type Job } from "@/lib/os/jobs";
import { leaveNote, readRoomMemory } from "@/lib/os/memory-sync";
import type { RoomMemory } from "@/lib/os/memory";

export function JobAkte({ job }: { job: Job }) {
  const rooms = jobRooms(job);
  const key = rooms.join("|");
  const [memories, setMemories] = useState<Record<string, RoomMemory | null>>({});
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const [line, setLine] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list = key ? key.split("|").filter(Boolean) : [];
    let stop = false;
    setReady(false);
    void Promise.all(list.map(async (room) => [room, await readRoomMemory(room)] as const)).then((pairs) => {
      if (stop) return;
      const next: Record<string, RoomMemory | null> = {};
      for (const [room, memory] of pairs) next[room] = memory;
      setMemories(next);
      setReady(true);
    });
    return () => {
      stop = true;
    };
  }, [key]);

  const dossier = compileDossier(job, memories);
  const text = dossierText(job, dossier);
  const has = dossier.now || dossier.covered.length || dossier.decided.length || dossier.people.length || dossier.open.length || dossier.done.length || dossier.last || dossier.cue;

  return (
    <section className="mt-3 border-t border-line pt-3" aria-label="Akte">
      <p className="text-xs text-copper">Akte · ohne Kamera</p>
      {!ready ? <p className="mt-1 text-sm text-mist">Die Akte wird gelesen.</p> : null}
      {ready && !has ? <p className="mt-1 text-sm text-mist">In diesen Räumen liegt noch nichts. Was gesagt und abgehakt wird, steht hier, auch wenn niemand mehr in der Kamera ist.</p> : null}
      {ready && has ? (
        <div className="mt-1 space-y-1 text-sm text-paper">
          {dossier.now ? <p>Jetzt: {dossier.now}</p> : null}
          {dossier.covered.length ? <p>Durchgegangen: {dossier.covered.map((point) => point.title).join(" · ")}</p> : null}
          {dossier.decided.length ? (
            <p>
              Entschieden:{" "}
              {dossier.decided.map((item) => (item.by && item.by !== "Gast" && item.by !== "Raum" ? `${item.title} · ${item.by}` : item.title)).join(" · ")}
            </p>
          ) : null}
          {dossier.people.length ? <p>Dabei: {dossier.people.join(" · ")}</p> : null}
          {dossier.open.length ? <p>Offen: {dossier.open.map((task) => task.title).join(" · ")}</p> : null}
          {dossier.done.length ? <p className="text-mist">Erledigt: {dossier.done.map((task) => task.title).join(" · ")}</p> : null}
          {dossier.last ? (
            <p>
              <span className="text-mist">{dossier.last.name}: </span>
              {dossier.last.text}
            </p>
          ) : null}
          {dossier.cue ? <p className="text-mist">Satz: {dossier.cue}</p> : null}
        </div>
      ) : null}
      {ready && has ? (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const asked = question.trim();
            if (!asked) return;
            setBusy(true);
            setAnswer("");
            void askRunde({ data: { intent: "ask", context: `Lies nur diese Akte. Erfinde nichts.\n${text}`, question: asked } })
              .then((result) => setAnswer(result.ok ? result.text : result.error))
              .catch(() => setAnswer("Die Akte antwortet gerade nicht."))
              .finally(() => setBusy(false));
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Frag die Akte"
            className="h-11 min-w-0 w-full flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper sm:w-auto"
          />
          <button type="submit" disabled={busy} className="h-11 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
            {busy ? "Liest…" : "Fragen"}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(
                () => setNote("Der Text liegt in der Zwischenablage. Ein anderes Werkzeug kann ihn nur lesen."),
                () => setNote("Der Text konnte nicht kopiert werden."),
              );
            }}
            className="h-11 rounded-full border border-line px-3 text-sm text-paper"
          >
            Text
          </button>
        </form>
      ) : null}
      {answer ? <p className="mt-2 text-sm text-paper">{answer}</p> : null}
      {ready && dossier.rooms[0] ? (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const room = dossier.rooms[0];
            if (!room) return;
            const who = getDraft("togetherName") || loadProfile().address;
            setBusy(true);
            void leaveNote(room, who, line).then((result) => {
              setNote(result.note);
              if (!result.note) setLine("");
              if (result.memory) setMemories((current) => ({ ...current, [room]: result.memory }));
              setBusy(false);
            });
          }}
        >
          <input
            value={line}
            onChange={(event) => setLine(event.target.value)}
            placeholder="Ohne Kamera"
            className="h-11 min-w-0 w-full flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper sm:w-auto"
          />
          <button type="submit" disabled={busy} className="h-11 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
            Schreiben
          </button>
        </form>
      ) : null}
      <p className="mt-2 text-sm text-mist">
        {dossier.rooms.map((room) => (
          <span key={room} className="mr-2 inline-flex items-center gap-1">
            {room}
            {room !== dossier.rooms[0] ? (
              <button type="button" onClick={() => detachRoom(job.id, room)} className="h-8 px-1 text-mist">
                weg
              </button>
            ) : null}
          </span>
        ))}
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const ok = attachRoom(job.id, code);
          setNote(ok ? "" : "Der Code gilt nicht oder hängt schon daran.");
          if (ok) setCode("");
        }}
      >
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Weiterer Raum"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
        <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
          Dazu
        </button>
      </form>
      {note ? <p className="mt-1 text-sm text-mist">{note}</p> : null}
    </section>
  );
}
