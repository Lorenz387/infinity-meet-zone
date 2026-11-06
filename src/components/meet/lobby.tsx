import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Captions, Languages, RefreshCw, Sparkles, Video } from "lucide-react";
import { Mark } from "@/components/meet/mark";
import { TranscribePanel } from "@/components/meet/transcribe-panel";
import { armAutostart, cleanCode, cleanName, makeId, primeCallDevices } from "@/lib/meet/media";
import { pushAgenda, readAgenda } from "@/lib/os/agenda";
import { AgendaEditor } from "@/components/meet/agenda";
import { THEME } from "@/lib/os/theme";

const field = "w-full rounded-xl border border-line bg-ink px-3 py-3 text-base text-paper outline-none placeholder:text-mist";

export function Lobby({ nested = false }: { nested?: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState(0);

  useEffect(() => {
    setName(localStorage.getItem("runde-name") ?? "");
    setCode(makeId(6));
    setReady(true);
  }, []);

  function join(event: FormEvent) {
    event.preventDefault();
    const next = cleanCode(code);
    if (next.length < 4 || readAgenda(next).points.length < 1) return;
    const agenda = readAgenda(next);
    void pushAgenda(next, { ...agenda, startedAt: agenda.startedAt ?? Date.now() });
    localStorage.setItem("runde-name", cleanName(name));
    primeCallDevices();
    armAutostart(next);
    void navigate({ to: "/r/$code", params: { code: next } });
  }

  return (
    <main className={nested ? "px-4 py-6 sm:px-6" : "studio min-h-dvh"}>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-12 lg:py-8">
        <section className="order-2 lg:order-1">
          {!nested ? (
            <div className="rise relative mx-auto mb-6 hidden size-40 lg:grid" aria-hidden>
              <span className="absolute inset-[18%] rounded-full border border-line" />
              <span className="absolute inset-[34%] rounded-full bg-copper/15" />
              <span className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full bg-copper" />
              <span className="absolute bottom-2 left-1/2 size-4 -translate-x-1/2 rounded-full bg-paper" />
              <span className="absolute left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-mist" />
              <span className="absolute right-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-paper" />
            </div>
          ) : null}
          <ul className="grid gap-4 text-mist sm:grid-cols-2 lg:grid-cols-1">
            <Feature icon={Video} title="Bis zu sechs Personen" text="Kamera, Stimme und Bildschirm laufen direkt zwischen den Browsern." />
            <Feature icon={Captions} title="Untertitel im Raum" text="Gesagtes wird mitgeschrieben, sobald du Untertitel einschaltest." />
            <Feature icon={Languages} title="Übersetzung live" text="Wähle eine Sprache. Jeder Satz erscheint darunter, nur bei dir." />
            <Feature icon={Sparkles} title="Arcy auf Zuruf" text="Er fasst zusammen, zieht Aufgaben oder eine Wortmeldung. Nur wenn du fragst." />
          </ul>
        </section>
        <section className="order-1 lg:order-2">
          <div className="rise mb-6 flex items-center gap-3">
            <Mark className="size-11 shrink-0" />
            <p className="font-display text-2xl text-paper">{THEME}</p>
          </div>
          <h1 className="rise font-display text-4xl font-medium text-paper sm:text-5xl">
            Der Raum ist da, <span className="font-semibold italic text-copper">sobald ihr es seid.</span>
          </h1>
          <p className="rise mt-4 max-w-md text-lg text-mist">Ein Meeting ohne Konferenzzentrum. Link teilen, Gesicht zeigen, weiterreden.</p>
          <form onSubmit={join} className="rise mt-6 rounded-3xl border border-line bg-panel p-5">
            <h2 className="font-display text-2xl text-paper">Raum betreten</h2>
            <label className="mt-5 block text-sm text-mist" htmlFor="name">
              Dein Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={32}
              placeholder="Wie sollen dich die anderen sehen?"
              className={`${field} mt-2`}
            />
            <label className="mt-4 block text-sm text-mist" htmlFor="code">
              Raumcode
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="code"
                value={code}
                onChange={(event) => setCode(cleanCode(event.target.value))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                placeholder={ready ? "" : "······"}
                className={`${field} tracking-widest`}
              />
              <button
                type="button"
                aria-label="Neuen Code erzeugen"
                onClick={() => setCode(makeId(6))}
                className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-raised text-paper transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
            <AgendaEditor room={cleanCode(code)} onCount={setPoints} />
            <button
              type="submit"
              disabled={!ready || cleanCode(code).length < 4 || points < 1}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-copper text-base font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
            >
              Beitreten
            </button>
            <p className="mt-3 text-sm text-mist">Beitreten schaltet Kamera und Mikrofon ein. Du kannst beides im Raum wieder ausmachen.</p>
          </form>
        </section>
      </div>
      {!nested ? <TranscribePanel /> : null}
    </main>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Video; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-panel text-copper">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block font-medium text-paper">{title}</span>
        <span className="mt-1 block text-sm">{text}</span>
      </span>
    </li>
  );
}
