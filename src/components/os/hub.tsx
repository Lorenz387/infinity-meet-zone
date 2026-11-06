import { useEffect, useRef, useState } from "react";
import { lensBlock, lensDrop, lensTake } from "@/lib/meet/lens";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { blobOfClip, commentClip, forgetClip, listClips, putClip, type Clip } from "@/lib/os/clips";

function Model() {
  const [rate, setRate] = useState("");
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    setRate(getDraft("rate"));
    setMinutes(getDraft("meetMinutes"));
    const pull = () => {
      setRate(getDraft("rate"));
      setMinutes(getDraft("meetMinutes"));
    };
    window.addEventListener("arc-demo", pull);
    return () => window.removeEventListener("arc-demo", pull);
  }, []);

  const euro = Number(rate.replace(",", "."));
  const span = Number(minutes);
  const cost = Number.isFinite(euro) && euro > 0 && Number.isFinite(span) && span > 0 ? Math.round((euro * span) / 60) : null;

  return (
    <section className="mt-6 border-t border-line pt-4">
      <h3 className="font-display text-2xl text-paper">Modell</h3>
      <p className="mt-1 text-sm text-mist">Zahlung ist nicht angeschlossen. Es wird nichts abgebucht. Die Grenzen von 8 am Tisch und 6 mit Ton bleiben.</p>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-paper">Frei bis 5 Personen</dt>
          <dd className="text-mist">Gedacht für kleine Teams. Ein Archiv, das nach 30 Tagen verschwindet, gibt es nicht, solange niemand zahlt.</dd>
        </div>
        <div>
          <dt className="text-paper">12–20 € pro Person im Monat</dt>
          <dd className="text-mist">Gedacht für mehr Speicher, angeschlossene Aufgaben und die vereinbarten Sicherheitsregeln. Noch kein Vertrag.</dd>
        </div>
        <div>
          <dt className="text-paper">Meeting-Kosten</dt>
          <dd className="text-mist">Nur aus deiner Eingabe. Kein Gehalt wird angenommen.</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={rate}
          onChange={(event) => {
            setRate(event.target.value);
            putDraft("rate", event.target.value);
          }}
          placeholder="Euro pro Stunde"
          inputMode="decimal"
          className="h-11 w-40 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
        <input
          value={minutes}
          onChange={(event) => {
            setMinutes(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
            putDraft("meetMinutes", event.target.value.replace(/[^\d]/g, "").slice(0, 4));
          }}
          placeholder="Minuten"
          inputMode="numeric"
          className="h-11 w-32 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
      </div>
      {cost != null ? <p className="mt-2 text-sm text-paper">{cost} € für diese Minuten, nach deiner Eingabe.</p> : null}
    </section>
  );
}

export function Hub() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef(0);

  async function refresh() {
    const next = await listClips();
    setClips(next);
    const mapped: Record<string, string> = {};
    for (const clip of next) {
      const blob = await blobOfClip(clip.id);
      if (blob) mapped[clip.id] = URL.createObjectURL(blob);
    }
    setUrls((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return mapped;
    });
  }

  useEffect(() => {
    void refresh();
    const pull = () => void refresh();
    window.addEventListener("arc-clips", pull);
    return () => {
      window.removeEventListener("arc-clips", pull);
      window.clearInterval(timer.current);
    };
  }, []);

  function stop() {
    window.clearInterval(timer.current);
    rec.current?.stop();
    rec.current = null;
    lensDrop("hub");
    setRecording(false);
  }

  async function start() {
    if (recording) {
      stop();
      return;
    }
    const devices = navigator.mediaDevices;
    const block = lensBlock("hub");
    if (block) {
      setNote(block);
      return;
    }
    if (!devices?.getUserMedia) {
      setNote("Dieser Browser nimmt kein Video auf.");
      return;
    }
    try {
      const stream = await devices.getUserMedia({ video: true, audio: true });
      lensTake("hub", stream.getVideoTracks()[0] ?? null, () => {
        stream.getTracks().forEach((track) => track.stop());
        stop();
      });
      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        lensDrop("hub");
        setNote("Dieser Browser nimmt kein Video auf.");
        return;
      }
      const begun = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        const taken = Math.min(120, Math.max(1, Math.round((Date.now() - begun) / 1000)));
        void putClip({ name: "Update", seconds: taken, blob }).then((result) => {
          setNote(result.ok ? "" : result.error);
          if (result.ok) void refresh();
        });
      };
      recorder.start();
      rec.current = recorder;
      setRecording(true);
      setSeconds(0);
      setNote("");
      timer.current = window.setInterval(() => {
        const taken = (Date.now() - begun) / 1000;
        setSeconds(Math.floor(taken));
        if (taken >= 120) stop();
      }, 250);
    } catch {
      setNote("Keine Kamera oder kein Mikrofon für die Aufnahme.");
    }
  }

  return (
    <div className="px-4 py-4">
      <h3 className="font-display text-2xl text-paper">Hub</h3>
      <p className="mt-1 text-sm text-mist">Ein Update, höchstens zwei Minuten. Kommentare liegen an der Sekunde, auf diesem Rechner.</p>
      <button type="button" onClick={() => void start()} className="mt-3 h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
        {recording ? `Stopp · ${seconds}s` : "Aufnahme"}
      </button>
      {note ? <p className="mt-2 text-sm text-copper">{note}</p> : null}
      <ul className="mt-4 space-y-4">
        {clips.map((clip) => (
          <li key={clip.id} className="rounded-2xl border border-line bg-panel p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-paper">
                {clip.name} · {clip.seconds}s
              </p>
              <button
                type="button"
                onClick={() => void forgetClip(clip.id).then(refresh)}
                className="h-10 rounded-full border border-line px-3 text-sm text-paper"
              >
                Weg
              </button>
            </div>
            {urls[clip.id] ? <video src={urls[clip.id]} controls className="mt-2 aspect-video w-full rounded-xl bg-ink" /> : null}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const field = event.currentTarget.elements.namedItem("note");
                const text = field instanceof HTMLInputElement ? field.value.trim().slice(0, 160) : "";
                if (!text) return;
                const video = event.currentTarget.parentElement?.querySelector("video");
                const atSec = Math.round(video?.currentTime || 0);
                void commentClip(clip.id, { id: `n-${Date.now().toString(36)}`, atSec, text, by: "Du" }).then(() => {
                  if (field instanceof HTMLInputElement) field.value = "";
                  void refresh();
                });
              }}
            >
              <input name="note" placeholder="An dieser Stelle" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
              <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
                Senden
              </button>
            </form>
            <ul className="mt-2 space-y-1">
              {clip.notes.map((item) => (
                <li key={item.id} className="text-sm text-mist">
                  {item.atSec}s · {item.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <Model />
    </div>
  );
}
