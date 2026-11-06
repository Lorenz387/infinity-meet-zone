import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileVideo, Languages } from "lucide-react";
import { formatStamp, type TranscriptCue } from "@/lib/meet/cues";
import { SPEECH_LANGS, TRANSLATE_LANGS, labelForDetected, translateLabel } from "@/lib/meet/languages";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { keepNow, readKept } from "@/lib/os/keep";

const field =
  "w-full rounded-xl border border-line bg-ink px-3 py-3 text-base text-paper outline-none placeholder:text-mist";

const SAVED = "arc-transcripts-v1";

type SavedScript = { name: string; text: string; at: number };

function readScripts(): SavedScript[] {
  try {
    const raw = JSON.parse(readKept(SAVED) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as SavedScript;
        if (typeof item.text !== "string" || !item.text.trim()) return null;
        return { name: typeof item.name === "string" ? item.name.slice(0, 80) : "Transkript", text: item.text.slice(0, 20000), at: typeof item.at === "number" ? item.at : Date.now() };
      })
      .filter((item): item is SavedScript => !!item)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function rememberScript(name: string, text: string) {
  const clean = text.trim();
  if (!clean) return;
  const next = [{ name, text: clean.slice(0, 20000), at: Date.now() }, ...readScripts().filter((item) => item.text !== clean)].slice(0, 8);
  keepNow(SAVED, JSON.stringify(next));
}

const MAX_BYTES = 4 * 1024 * 1024;

type LoadedCue = TranscriptCue & { translation?: string };

type Job =
  | { phase: "idle" }
  | { phase: "run" }
  | {
      phase: "done";
      name: string;
      url: string;
      video: boolean;
      text: string;
      language: string;
      duration: number;
      cues: LoadedCue[];
      block: string | null;
      note: string | null;
      translationError: string | null;
    }
  | { phase: "error"; message: string };

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function scriptText(cues: LoadedCue[], block: string | null): string {
  const lines = cues.map((cue) => {
    const who = cue.speaker === undefined ? "" : `Stimme ${cue.speaker + 1}: `;
    const translated = cue.translation ? `\n${cue.translation}` : "";
    return `[${formatStamp(cue.start)}] ${who}${cue.text}${translated}`;
  });
  if (block) lines.push("", block);
  return lines.join("\n");
}

export function TranscribePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [job, setJob] = useState<Job>({ phase: "idle" });
  const [playhead, setPlayhead] = useState(0);
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const source = getDraft("trSource");
    const target = getDraft("trTarget");
    if (source) setSourceLang(source);
    if (target) setTargetLang(target);
    setSaved(readScripts());
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function takeFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setJob({ phase: "error", message: "Maximal 4 MB. Kürzer schneiden oder die Tonspur als mp3 schicken." });
      setPicked(null);
      return;
    }
    setPicked(file);
    setJob({ phase: "idle" });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    takeFile(event.dataTransfer.files[0] ?? null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!picked || job.phase === "run") return;
    const body = new FormData();
    body.append("language", sourceLang);
    body.append("translate", targetLang);
    body.append("file", picked);
    setJob({ phase: "run" });
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        text?: string;
        language?: string;
        duration?: number;
        cues?: TranscriptCue[];
        translations?: string[] | null;
        translation?: string | null;
        translationError?: string | null;
        note?: string | null;
      };
      if (!response.ok || !payload.ok) {
        setJob({ phase: "error", message: payload.error || "Die Transkription ist fehlgeschlagen." });
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(picked);
      urlRef.current = url;
      const cues = (payload.cues ?? []).map((cue, index) => ({
        ...cue,
        ...(payload.translations && payload.translations[index]
          ? { translation: payload.translations[index] }
          : {}),
      }));
      const video = picked.type.startsWith("video") || /\.(mp4|webm|mov|mkv|avi)$/i.test(picked.name);
      const text = payload.text ?? "";
      rememberScript(picked.name, scriptText(cues, payload.translation ?? null) || text);
      setSaved(readScripts());
      setPlayhead(0);
      setJob({
        phase: "done",
        name: picked.name,
        url,
        video,
        text: payload.text ?? "",
        language: payload.language ?? "",
        duration: payload.duration ?? 0,
        cues,
        block: payload.translation ?? null,
        note: payload.note ?? null,
        translationError: payload.translationError ?? null,
      });
    } catch {
      setJob({ phase: "error", message: "Die Datei konnte nicht geschickt werden." });
    }
  }

  const active =
    job.phase === "done"
      ? [...job.cues].reverse().find((cue) => playhead + 0.05 >= cue.start)
      : undefined;

  async function copyScript() {
    if (job.phase !== "done") return;
    const text = scriptText(job.cues, job.block) || job.text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The script stays on screen either way.
    }
  }

  function downloadScript() {
    if (job.phase !== "done") return;
    const blob = new Blob([scriptText(job.cues, job.block) || job.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transkript.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <form onSubmit={(event) => void onSubmit(event)} className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-copper">
            <FileVideo className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-2xl text-paper">Video transkribieren</h2>
            <p className="mt-1 max-w-2xl text-sm text-mist">
              Kurzer Clip oder Sprachdatei, bis 4 MB. Du bekommst das Gesagte mit Zeiten, Sprecherwechseln und einer Übersetzung.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-mist">
            Sprache im Video
            <select
              value={sourceLang}
              onChange={(event) => {
                setSourceLang(event.target.value);
                putDraft("trSource", event.target.value);
              }}
              className={`${field} mt-2`}
            >
              <option value="">Automatisch erkennen</option>
              {SPEECH_LANGS.map((item) => (
                <option key={item.id} value={item.id.slice(0, 2)}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-mist">
            Übersetzen nach
            <select
              value={targetLang}
              onChange={(event) => {
                setTargetLang(event.target.value);
                putDraft("trTarget", event.target.value);
              }}
              className={`${field} mt-2`}
            >
              {TRANSLATE_LANGS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === "off" ? "Nicht übersetzen" : item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`mt-4 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center ${
            over ? "border-copper bg-ink" : "border-line bg-ink"
          }`}
        >
          <FileVideo className="size-5 text-copper" />
          <span className="mt-2 text-sm text-paper">{picked ? picked.name : "Video oder Audio hierher ziehen"}</span>
          <span className="mt-1 text-sm text-mist">
            {picked ? formatBytes(picked.size) : "mp4, webm, mov, mp3, m4a, wav"}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,.mp4,.webm,.mov,.mkv,.avi,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac"
          className="sr-only"
          onChange={(event) => {
            takeFile(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />

        <button
          type="submit"
          disabled={!picked || job.phase === "run"}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-copper text-base font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
        >
          <Languages className="size-4" />
          {job.phase === "run" ? "Wird transkribiert…" : "Transkript erstellen"}
        </button>
        {job.phase === "error" ? (
          <p className="mt-3 text-sm text-paper" role="alert">
            {job.message}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-mist">Die Mediendatei bleibt nur für diese Anfrage. Der Text bleibt auf diesem Rechner.</p>
      </form>
      {saved.length ? (
        <div className="mt-4 space-y-2">
          <h3 className="font-display text-2xl text-paper">Gespeicherte Transkripte</h3>
          {saved.map((item) => (
            <article key={`${item.at}-${item.name}`} className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-xs text-mist">{item.name}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-paper">{item.text}</p>
            </article>
          ))}
        </div>
      ) : null}

      {job.phase === "done" ? (
        <div className="mt-4 rounded-3xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl text-paper">{job.name}</h3>
              <p className="mt-1 text-sm text-mist">
                {formatStamp(job.duration)}
                {job.language ? ` · erkannt: ${labelForDetected(job.language)}` : ""}
                {targetLang !== "off" ? ` · ${translateLabel(targetLang)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyScript()} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
                Kopieren
              </button>
              <button type="button" onClick={downloadScript} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
                Download
              </button>
            </div>
          </div>

          {job.video ? (
            <video
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={job.url}
              controls
              playsInline
              onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
              className="mt-4 aspect-video w-full rounded-2xl bg-ink"
            />
          ) : (
            <audio
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={job.url}
              controls
              onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
              className="mt-4 w-full"
            />
          )}

          {active ? (
            <div className="mt-3 rounded-xl bg-ink px-3 py-2 text-sm" aria-live="polite">
              <p className="text-paper">{active.text}</p>
              {active.translation ? (
                <p dir="auto" className="mt-1 text-copper">
                  {active.translation}
                </p>
              ) : null}
            </div>
          ) : null}

          {job.note ? <p className="mt-4 text-sm text-mist">{job.note}</p> : null}
          {job.translationError ? <p className="mt-2 text-sm text-mist">{job.translationError}</p> : null}

          <ol className="mt-4 max-h-96 space-y-3 overflow-y-auto">
            {job.cues.map((cue, index) => {
              const on = active === cue;
              return (
                <li key={`${cue.start}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const node = mediaRef.current;
                      if (!node) return;
                      node.currentTime = cue.start;
                      void node.play().catch(() => {});
                    }}
                    className={`w-full rounded-2xl px-3 py-2 text-left ${on ? "bg-raised" : "bg-ink"}`}
                  >
                    <span className="text-xs tabular-nums text-mist">
                      {formatStamp(cue.start)}
                      {cue.speaker === undefined ? "" : ` · Stimme ${cue.speaker + 1}`}
                    </span>
                    <span className="mt-1 block text-sm text-paper">{cue.text}</span>
                    {cue.translation ? (
                      <span dir="auto" className="mt-1 block text-sm text-copper">
                        {cue.translation}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          {job.block ? (
            <p dir="auto" className="mt-4 whitespace-pre-wrap text-sm text-copper">
              {job.block}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
