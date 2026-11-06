import { useEffect, useRef, useState } from "react";
import { askRunde } from "@/lib/meet/assistant";
import { profileLines } from "@/lib/os/arcy";
import type { CaptionLine } from "@/lib/meet/use-call";
import { packContext } from "@/lib/os/intents";
import { loadLook, patchLook, subscribeLook, type OsLook } from "@/lib/os/look";
import { addCard, openTaskText, pinLive, setTaskDone, useSheets } from "@/lib/os/sheets";
import { THEME } from "@/lib/os/theme";
import type { ProtocolSheet, SheetCard } from "@/lib/os/types";

function liveOf(sheets: ProtocolSheet[], room: string) {
  return sheets.find((sheet) => sheet.id === `live:${room}`) ?? null;
}

function CardView({ card, onDone }: { card: SheetCard; onDone?: (done: boolean) => void }) {
  if (card.kind === "audit") {
    return (
      <article className="rounded-2xl border border-line bg-ink p-3">
        <p className="text-xs text-mist">Prüfung · nur bei dir · {card.source}</p>
        <p className="mt-1 text-sm text-paper">{card.headline}</p>
        <p className="mt-2 text-sm text-mist">{card.claim}</p>
        <p className={`mt-2 text-sm ${card.verdict === "match" ? "text-paper" : "text-copper"}`}>{card.detail}</p>
      </article>
    );
  }
  if (card.kind === "booking") {
    const label = card.status === "freigegeben" ? "Vorgemerkt" : card.status === "abgelehnt" ? "Liegen gelassen" : "Offen";
    return (
      <article className="rounded-2xl border border-line bg-ink p-3">
        <p className="text-xs text-copper">Reservierung · {label}</p>
        <p className="mt-1 text-sm text-paper">Tisch in {card.place}</p>
      </article>
    );
  }
  if (card.kind === "task") {
    return (
      <article className="rounded-2xl border border-line bg-ink p-3">
        <p className="text-xs text-copper">Aufgabe{card.done ? " · erledigt" : ""}</p>
        <p className={`mt-1 text-sm text-paper ${card.done ? "line-through decoration-mist" : ""}`}>{card.title}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-mist">{card.body}</p>
        <button type="button" onClick={() => onDone?.(!card.done)} className="mt-2 h-10 rounded-full border border-line px-3 text-sm text-paper">
          {card.done ? "Wieder offen" : "Erledigt"}
        </button>
      </article>
    );
  }
  if (card.kind === "mail") {
    return (
      <article className="rounded-2xl border border-line bg-ink p-3">
        <p className="text-xs text-copper">Mail</p>
        <p className="mt-1 text-sm text-paper">{card.subject}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-mist">{card.body}</p>
      </article>
    );
  }
  if (card.kind === "note") return <p className="rounded-2xl bg-ink px-3 py-2 text-sm text-mist">{card.text}</p>;
  return (
    <article className="rounded-2xl border border-line bg-ink p-3">
      <p className="text-xs text-copper">{card.title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-paper">{card.body}</p>
    </article>
  );
}

export function ArcPanel({
  room,
  captions,
  screen,
}: {
  room: string;
  captions: CaptionLine[];
  screen: string | null;
}) {
  const sheets = useSheets();
  const sheet = liveOf(sheets, room);
  const [tab, setTab] = useState<"blatt" | "system">("blatt");
  const [pack, setPack] = useState<string | null>(null);
  const [look, setLook] = useState<OsLook>({ scale: "base", contrast: false, allow: false });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copyRef = useRef<() => void>(() => {});

  useEffect(() => {
    setLook(loadLook());
    return subscribeLook(() => setLook(loadLook()));
  }, []);

  const context = () =>
    packContext({
      now: Date.now(),
      room,
      captions,
      screen,
    });

  async function copyContext() {
    const text = context();
    setPack(text);
    setTab("blatt");
    try {
      await navigator.clipboard.writeText(text);
      setNote("Kontext der letzten zwei Minuten ist kopiert.");
    } catch {
      setNote("Kopieren hat der Browser blockiert. Der Text steht unten.");
    }
  }

  copyRef.current = () => {
    void copyContext();
  };

  useEffect(() => {
    const onContext = () => copyRef.current();
    window.addEventListener("arc-context", onContext);
    return () => window.removeEventListener("arc-context", onContext);
  }, []);

  async function sharpen() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await askRunde({ data: { intent: "summary", context: `${profileLines()}\n\n${context()}`, question: "" } });
      addCard(room, {
        id: `note:${Date.now()}`,
        at: Date.now(),
        kind: "note",
        text: result.ok ? result.text : result.error,
      });
    } finally {
      setBusy(false);
    }
  }

  function makeTask() {
    const body = pack ?? context();
    addCard(room, { id: `task:${Date.now()}`, at: Date.now(), kind: "task", title: `Aus ${THEME} ${room}`, body });
    setNote("Aufgabe liegt auf dem Blatt.");
  }

  function makeMail() {
    const body = (pack ?? context()).slice(0, 1500);
    const subject = `Aus ${THEME} ${room}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    addCard(room, { id: `mail:${Date.now()}`, at: Date.now(), kind: "mail", subject, body });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
        {(
          [
            ["blatt", "Blatt"],
            ["system", "System"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-10 shrink-0 rounded-full px-3 text-sm ${tab === id ? "bg-copper text-ink" : "bg-raised text-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {note ? <p className="text-sm text-mist">{note}</p> : null}
        {tab === "blatt" ? (
          <>
            <p className="text-sm text-mist">
              {THEME} hört mit, sobald Untertitel an sind. Das Blatt bleibt in diesem Browser. Taste K kopiert die letzten zwei Minuten samt Bildschirm.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyContext()} className="h-10 rounded-full bg-copper px-3 text-sm font-medium text-ink">
                Kontext kopieren
              </button>
              <button type="button" onClick={makeTask} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
                Als Aufgabe
              </button>
              <button type="button" onClick={makeMail} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
                Als Mail
              </button>
              <button type="button" onClick={() => void sharpen()} disabled={busy} className="h-10 rounded-full border border-line px-3 text-sm text-paper disabled:opacity-40">
                {busy ? "Fasst…" : "Blatt fassen"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNote(pinLive(room, 1) ? "Für einen Tag auf dem Dashboard." : "Noch nichts zum Fixieren.")}
                className="h-10 flex-1 rounded-full border border-line text-sm text-paper"
              >
                1 Tag fixieren
              </button>
              <button
                type="button"
                onClick={() => setNote(pinLive(room, 30) ? "Für einen Monat auf dem Dashboard." : "Noch nichts zum Fixieren.")}
                className="h-10 flex-1 rounded-full border border-line text-sm text-paper"
              >
                1 Monat
              </button>
            </div>
            {pack ? <pre className="whitespace-pre-wrap rounded-2xl bg-ink p-3 text-sm text-paper">{pack}</pre> : null}
            {sheet && openTaskText(sheet.cards) ? (
              <button
                type="button"
                onClick={() => {
                  const text = openTaskText(sheet.cards);
                  void navigator.clipboard.writeText(text).then(
                    () => setNote("Offene Aufgaben kopiert. Jira, Trello und Asana sind nicht angeschlossen."),
                    () => setNote("Kopieren hat der Browser blockiert."),
                  );
                }}
                className="h-10 rounded-full border border-line px-3 text-sm text-paper"
              >
                Offene Aufgaben kopieren
              </button>
            ) : null}
            {sheet?.heard.map((line) => (
              <p key={line.id} className="text-sm text-paper">
                <span className="text-mist">{line.name}: </span>
                {line.text}
              </p>
            ))}
            {sheet?.cards.map((card) => (
              <CardView key={card.id} card={card} onDone={card.kind === "task" ? (done) => setTaskDone(room, card.id, done) : undefined} />
            ))}
            {!sheet?.cards.length && !sheet?.heard.length ? (
              <p className="text-sm text-mist">
                Sag zum Beispiel: Wir müssen die Übergabe nicht vergessen. Die Aufgabe erscheint hier.
              </p>
            ) : null}
          </>
        ) : null}
        {tab === "system" ? (
          <>
            <p className="text-sm text-mist">
              Wenn du es erlaubst und jemand ein Skript erwähnt, stellt {THEME} bei dir Schrift und Kontrast schärfer. Andere Bildschirme bleiben, wie sie sind.
            </p>
            <label className="flex items-center gap-3 text-sm text-paper">
              <input type="checkbox" checked={look.allow} onChange={(event) => patchLook({ allow: event.target.checked })} />
              Darstellung darf mitziehen
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["base", "Normal"],
                  ["read", "Lesen"],
                  ["large", "Groß"],
                ] as const
              ).map(([scale, label]) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => patchLook({ scale })}
                  className={`h-10 rounded-full px-3 text-sm ${look.scale === scale ? "bg-copper text-ink" : "border border-line text-paper"}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => patchLook({ contrast: !look.contrast })}
                className={`h-10 rounded-full px-3 text-sm ${look.contrast ? "bg-copper text-ink" : "border border-line text-paper"}`}
              >
                Kontrast
              </button>
            </div>
            <p className="text-sm text-mist">Einbinden steht auf der Übersicht. Der Raum schickt Ereignisse nur an das Fenster, das ihn eingebettet hat.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
