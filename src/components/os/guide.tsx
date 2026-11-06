import { useState } from "react";
import { THEME } from "@/lib/os/theme";

const SEEN = "arc-guide-v1";
const LATER = "arc-guide-later";

export function guidePending() {
  try {
    if (localStorage.getItem(SEEN) === "1") return false;
    return sessionStorage.getItem(LATER) !== "1";
  } catch {
    return false;
  }
}

export function rememberGuide() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // The tour still closes. It may return next time.
  }
}

export function deferGuide() {
  try {
    sessionStorage.setItem(LATER, "1");
  } catch {
    // Closing still works for this view.
  }
}

const COMMANDS = [
  "Auftrag Müller Film Dreh am Freitag",
  "Zeit 16:30 Müller",
  "Ort Studio Müller",
  "Crew Kim Kamera Müller",
  "Frei Schnitt steht Müller",
  "Notiz Liefertermin klären",
  "Protokoll Drehbuch",
  "Seite example.com",
  "Einblendung Wir starten um 16:30",
  "Gedanke wir starten jetzt",
  "Ablauf Start | Wir starten jetzt | Kurze Pause",
  "Nächster Schritt",
  "Gemeinsam werkstatt",
  "Allein",
  "Export",
  "Führung",
  "Demo",
];

const STEPS: { title: string; do: string; why: string; seen?: string[]; lines?: string[] }[] = [
  {
    title: "Der Schreibtisch",
    do: "Oben das Feld Befehl an Arcy. Enter führt den Satz aus. Darunter Kunde, Was ansteht und der Knopf Auftrag. Demo füllt ein Beispiel in alle Fenster.",
    why: "Was du schreibst, bleibt auf diesem Rechner, auch mitten im Satz. Führung holt diese Erklärung wieder. Die Demo ist kein Kundenauftrag.",
    seen: ["Befehl an Arcy", "Führung", "Demo", "Kunde", "Auftrag", "Protokoll anlegen"],
  },
  {
    title: "Gedanke auf die Kamera",
    do: "Fenster Gedanke. Feld Dein Gedanke, dann Auf die Kamera. Ein Workflow hat Name, Schritte und Workflow anlegen. Nächster Schritt geht weiter.",
    why: "Der Satz steht unten im Bild. An alle legt ihn zusätzlich auf den gemeinsamen Tisch. Zuhören nimmt einen gesprochenen Satz, wenn der Browser das kann.",
    seen: ["Dein Gedanke", "Auf die Kamera", "Zuhören", "An alle", "Workflow anlegen", "Nächster Schritt"],
    lines: ["Gedanke wir starten jetzt", "Ablauf Start | Wir starten jetzt | Kurze Pause", "Nächster Schritt"],
  },
  {
    title: "Zusammen",
    do: "Gemeinsam: Dein Name, Code, Dabei. Danach Ton und Bild. Zone: Raumcode und Beitreten. Dieselbe Zeichenfolge, zwei Verbindungen.",
    why: "Acht Personen am Tisch, sechs mit Ton und Bild. Ohne direkte Verbindung der Netze kommt Ton und Bild nicht zustande. Läuft die Zone schon, bleibt das Mikrofon dort.",
    seen: ["Gemeinsam", "Dabei", "Ton und Bild", "Zone", "Beitreten", "Allein"],
  },
  {
    title: "Was liegen bleibt",
    do: "Export speichert die Datei infinity-meet-zone-export. Auf dem anderen Rechner Einklinken, dann Übernehmen.",
    why: "Unter Last wird Tippen gebündelt gesichert. Ein leerer Raum ersetzt keinen vollen. Eine Kurzfassung auf der Leitung lässt den vollen Tisch hier stehen. Geht der Speicher zur Neige, weichen zuerst alte Transkripte, nicht die Aufträge. Die Mediendatei eines Transkripts bleibt nicht, nur der Text.",
    seen: ["Export", "Einklinken", "Übernehmen", "Gespeicherte Gedanken", "Gespeicherte Transkripte"],
  },
];

const MANUAL: { title: string; body: string; names?: string[] }[] = [
  {
    title: "Schreibtisch",
    body: "Ein Auftrag ist Kunde und Arbeit. Die Karte trägt den Stand und den Raum. Die Akte liest alle Räume des Auftrags, ohne die Kamera einzuschalten: was jetzt dran ist, was durch ist, was entschieden ist, wer dabei war, der letzte Satz. Frag die Akte stellt eine Frage nur an diesen Text. Text kopiert ihn, damit ein anderes Werkzeug ihn lesen kann. Schreiben legt eine Zeile in den ersten Raum, ohne die Kamera. Dafür braucht es den Namen aus Gemeinsam. Die Zeile bleibt bei diesem Namen. Ein anderer Name überschreibt sie nicht. Eine Entscheidung bleibt bei dem Namen, der sie getroffen hat. Ein anderer Name und Gast setzen sich nicht darunter. Dieselbe Person kann ihre eigene später korrigieren. Ein leerer Raum wischt sie nicht weg. Weiterer Raum hängt einen weiteren Code daran. Sie zeigt nur, was gespeichert ist. Demo lädt Atelier Nord als Beispiel, keinen echten Auftrag.",
    names: ["Kunde", "Web", "Film", "Event", "Laden", "Dienst", "Was ansteht", "Auftrag", "Offen", "Läuft", "Fertig", "Schritt", "Jetzt", "Laufzettel", "Weg", "Raum", "Akte", "Frag die Akte", "Text", "Ohne Kamera", "Schreiben", "Weiterer Raum", "Protokoll anlegen", "Demo"],
  },
  {
    title: "Sitzungen",
    body: "Mehrere Räume bleiben gleichzeitig offen, jeder mit seinen Personen. Sitzung öffnet einen weiteren Code. Die Tageszone dieses Tages liegt beim ersten Öffnen schon da. Im Bild legt Ton und Kamera in diesen einen Raum. Die anderen bleiben zum Schreiben offen. Arcy hört zu, wenn du etwas sagst oder sprichst, und sieht dich nur mit Kamera an. Das Bild geht nicht an die anderen. Live schaut ein paar Mal und gibt dann Ruhe. Kennen liest die offenen Sitzungen und sagt nur, was dort gespeichert ist. Prüfung öffnet jedes gemeldete Bildgerät kurz, nennt was ankommt, und lässt es wieder los. Sie speichert nichts und schickt das Bild nicht.",
    names: ["Sitzung", "Heute", "Im Bild", "Zu", "Kamera an", "Kamera aus", "Schau", "Live", "Ruhe", "Schreiben", "Sprechen", "Senden", "Kennen", "Prüfung"],
  },
  {
    title: "Fenster",
    body: "Unten die Leiste. Im Fenster Beiseite und Schließen.",
    names: ["Arcy", "Tag", "Datei", "Seite", "Blätter", "Zone", "Transkript", "Gedanke", "Einbinden", "Hub", "Beiseite", "Schließen"],
  },
  {
    title: "Gedanke",
    body: "Digitale Kamera zeigt den Balken. Kamera zeigen öffnet die Vorschau hier.",
    names: ["Digitale Kamera", "Kamera zeigen", "Vorschau aus", "Dein Gedanke", "Auf die Kamera", "Zuhören", "An alle", "Nochmal", "Name", "Schritte", "Workflow anlegen", "Nächster Schritt", "Von vorn", "Schritt an alle", "Entfernen"],
  },
  {
    title: "Zusammen und Zone",
    body: "Gemeinsam teilt Aufträge, Protokolle, Zettel und den Satz. Steht ein Auftrag auf Läuft, liegt sein Code im Feld. Dabei tritt erst bei, wenn du das willst. Passt nicht alles auf die Leitung, geht die Kurzfassung hinaus und der volle Stand bleibt hier. Stand, Uhrzeit und Ort eines Auftrags bleiben, wenn jemand ein anderes Feld ändert. Zone ist das Bildgespräch. Wer den Code kennt, kann beitreten.",
    names: ["Dein Name", "Code", "Dabei", "Allein", "Satz für alle", "Senden", "Ton aus", "Ton an", "Kamera aus", "Kamera an", "Auflegen", "Du", "Raumcode", "Beitreten", "Neuen Code erzeugen", "Einblenden", "Aus", "Nachricht", "Zurück"],
  },
  {
    title: "Agenda und Hub",
    body: "Ohne Punkt kein Start. Jeder Punkt hat Minuten. Läuft die Zeit ab, steht Zeit ist um, bis jemand Nächster Punkt wählt. Sagt jemand im Untertitel, dass er etwas übernimmt, liegt die Aufgabe auf dem Protokoll. In der Kamera steht, was in diesem Raum schon gesagt, abgehakt und offen ist. Wer später dazukommt, sieht denselben Verlauf. Jira, Trello und Asana sind nicht angeschlossen. Im Hub dauert eine Aufnahme höchstens zwei Minuten. An dieser Stelle hängt den Kommentar an die Sekunde, auf diesem Rechner. Das Modell bucht nichts ab und löscht kein Archiv nach 30 Tagen.",
    names: ["Punkt", "Minuten", "Hinzufügen", "Nächster Punkt", "Zeit ist um", "Beteiligung", "Aufnahme", "Stopp", "An dieser Stelle", "Modell", "Euro pro Stunde", "Hub"],
  },
  {
    title: "Was absichtlich nicht passiert",
    body: "Keine erfundenen Zahlen und keine Zahlung. Es wird nichts verkauft, und es gibt keine Bewertungen. Kein zweites Mikrofon neben der Zone. Eine Seite, die das Einbetten verbietet, bleibt leer. Ohne direkte Verbindung der Netze kommt Ton und Bild nicht zustande. Dieselbe Zeile im Protokoll wird nicht doppelt angehängt. Schriften kommen aus der Anwendung, nicht von Google.",
  },
];

export function Guide({ onClose, onDemo }: { onClose: () => void; onDemo?: () => void }) {
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  function finish() {
    rememberGuide();
    onClose();
  }

  function later() {
    deferGuide();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="flex max-h-[min(40rem,calc(100dvh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <p className="text-xs text-copper">{manual ? "Anleitung" : `Führung ${step + 1} von ${STEPS.length}`}</p>
          <button type="button" onClick={() => setManual((value) => !value)} className="ml-auto h-10 rounded-full border border-line px-3 text-sm text-paper">
            {manual ? "Zurück zur Führung" : "Ganze Anleitung"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {manual ? (
            <div className="space-y-5">
              <h2 id="guide-title" className="font-display text-3xl text-paper">
                Bedienung von {THEME}
              </h2>
              {MANUAL.map((part) => (
                <section key={part.title}>
                  <h3 className="font-display text-2xl text-paper">{part.title}</h3>
                  <p className="mt-1 text-sm text-mist">{part.body}</p>
                  {part.names ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {part.names.map((name) => (
                        <li key={name} className="rounded-full border border-line bg-ink px-3 py-1 text-sm text-paper">
                          {name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
              <section>
                <h3 className="font-display text-2xl text-paper">Befehle</h3>
                <ul className="mt-2 space-y-1">
                  {COMMANDS.map((line) => (
                    <li key={line} className="rounded-xl bg-ink px-3 py-2 font-mono text-sm text-paper">
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <>
              <h2 id="guide-title" className="font-display text-3xl text-paper">
                {current.title}
              </h2>
              <p className="mt-3 text-sm text-paper">{current.do}</p>
              <p className="mt-3 text-sm text-mist">{current.why}</p>
              {current.seen ? (
                <>
                  <p className="mt-4 text-xs text-copper">Genau diese Wörter stehen so in der Oberfläche.</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {current.seen.map((name) => (
                      <li key={name} className="rounded-full border border-line bg-ink px-3 py-1 text-sm text-paper">
                        {name}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {current.lines ? (
                <ul className="mt-4 space-y-1">
                  {current.lines.map((line) => (
                    <li key={line} className="rounded-xl bg-ink px-3 py-2 font-mono text-sm text-paper">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          {manual ? null : (
            <button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} className="h-11 rounded-full border border-line px-4 text-sm text-paper disabled:opacity-40">
              Zurück
            </button>
          )}
          <button type="button" onClick={later} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
            Später
          </button>
          {onDemo ? (
            <button
              type="button"
              onClick={() => {
                rememberGuide();
                onDemo();
              }}
              className="h-11 rounded-full border border-line px-4 text-sm text-paper"
            >
              Demo
            </button>
          ) : null}
          {manual ? (
            <button type="button" onClick={finish} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
              Auf den Schreibtisch
            </button>
          ) : (
            <button type="button" onClick={() => (last ? finish() : setStep((value) => value + 1))} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
              {last ? "Auf den Schreibtisch" : "Weiter"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
