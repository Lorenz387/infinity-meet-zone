import { wordsToCues, type TranscriptCue, type TranscriptWord } from "@/lib/meet/cues";
import { isTranslateId } from "@/lib/meet/languages";
import { translateLinesWithGrok } from "@/lib/meet/translate";
import { readCappedBytes } from "@/lib/os/guard";

const MAX_BYTES = 4 * 1024 * 1024;
const EXTENSIONS = new Set(["wav", "mp3", "ogg", "opus", "flac", "aac", "mp4", "m4a", "mkv", "webm", "avi", "mov"]);
const FORMAT_LANGS = new Set(["ar", "de", "en", "es", "fr", "ja", "pt", "ru", "sv", "vi", "zh"]);
const SOURCE_LANGS = new Set(["de", "en", "fr", "es", "it", "pl", "tr", "uk", "ru", "ar", "zh", "ja", "pt", "nl"]);

const sttBucket = globalThis as typeof globalThis & { __rundeSttHits?: number[] };

function allowStt(): boolean {
  const now = Date.now();
  const hits = (sttBucket.__rundeSttHits ?? []).filter((stamp) => now - stamp < 60_000);
  if (hits.length >= 4) {
    sttBucket.__rundeSttHits = hits;
    return false;
  }
  hits.push(now);
  sttBucket.__rundeSttHits = hits;
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function readWords(value: unknown): TranscriptWord[] {
  if (!Array.isArray(value)) return [];
  const words: TranscriptWord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text !== "string") continue;
    const start = Number(record.start);
    const end = Number(record.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    words.push({
      text: record.text.slice(0, 80),
      start,
      end,
      ...(Number.isInteger(record.speaker) && (record.speaker as number) >= 0 && (record.speaker as number) <= 32
        ? { speaker: record.speaker as number }
        : {}),
    });
  }
  return words;
}

async function translateCues(
  cues: TranscriptCue[],
  lang: string,
): Promise<{ lines: string[] | null; block: string | null; error: string | null }> {
  if (!cues.length) return { lines: null, block: null, error: null };
  if (cues.length > 72) {
    const chunks: string[] = [];
    let rest = cues
      .map((cue) => cue.text)
      .join(" ")
      .slice(0, 9000);
    while (rest.length && chunks.length < 3) {
      if (rest.length <= 2800) {
        chunks.push(rest);
        break;
      }
      let cut = rest.lastIndexOf(" ", 2800);
      if (cut < 1400) cut = 2800;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).trim();
    }
    const parts: string[] = [];
    for (const chunk of chunks) {
      const result = await translateLinesWithGrok([chunk], lang);
      if (!result.ok) return { lines: null, block: null, error: result.error };
      parts.push(result.lines[0] ?? "");
    }
    return { lines: null, block: parts.filter(Boolean).join("\n\n"), error: null };
  }
  const lines: string[] = [];
  for (let index = 0; index < cues.length; index += 12) {
    const slice = cues.slice(index, index + 12).map((cue) => cue.text);
    const result = await translateLinesWithGrok(slice, lang);
    if (!result.ok) return { lines: null, block: null, error: result.error };
    if (result.lines.length !== slice.length) {
      return { lines: null, block: result.lines.join("\n"), error: null };
    }
    lines.push(...result.lines);
  }
  return { lines, block: null, error: null };
}

export async function transcribeUpload(request: Request): Promise<Response> {
  const capped = await readCappedBytes(request, MAX_BYTES + 48_000);
  if (!capped.ok) {
    return json({ ok: false, error: "Maximal 4 MB. Kürzer schneiden oder die Tonspur als mp3 schicken." }, 413);
  }
  let form: FormData;
  try {
    const type = request.headers.get("content-type") || "";
    const raw = new ArrayBuffer(capped.bytes.byteLength);
    new Uint8Array(raw).set(capped.bytes);
    form = await new Request(request.url, {
      method: "POST",
      headers: type ? { "content-type": type } : undefined,
      body: raw,
    }).formData();
  } catch {
    return json({ ok: false, error: "Die Datei ist nicht angekommen." }, 400);
  }
  const uploaded = form.get("file");
  if (!(uploaded instanceof File)) return json({ ok: false, error: "Wähle zuerst eine Video- oder Audiodatei." }, 400);
  const ext = extensionOf(uploaded.name);
  if (!EXTENSIONS.has(ext)) {
    return json(
      { ok: false, error: "Dieses Format kann ich nicht lesen. Nimm mp4, webm, mov, mp3, m4a oder wav." },
      400,
    );
  }
  if (uploaded.size <= 0) return json({ ok: false, error: "Die Datei ist leer." }, 400);
  if (uploaded.size > MAX_BYTES) {
    return json({ ok: false, error: "Maximal 4 MB. Kürzer schneiden oder die Tonspur als mp3 schicken." }, 413);
  }
  if (!allowStt()) return json({ ok: false, error: "Gerade zu viele Transkriptionen. Einen Moment warten." }, 429);

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return json({ ok: false, error: "Transkription ist in dieser Umgebung nicht verbunden." }, 503);

  const source = String(form.get("language") ?? "").trim().toLowerCase();
  const language = SOURCE_LANGS.has(source) ? source : "";
  const targetRaw = String(form.get("translate") ?? "").trim().toLowerCase();
  const translate = targetRaw && targetRaw !== "off" && isTranslateId(targetRaw) ? targetRaw : "";

  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const send = () => {
    const outbound = new FormData();
    outbound.append("model", "grok-voice-transcribe-2.0");
    outbound.append("diarize", "true");
    if (language) {
      outbound.append("language", language);
      if (FORMAT_LANGS.has(language)) outbound.append("format", "true");
    }
    outbound.append("file", new Blob([bytes], { type: uploaded.type || "application/octet-stream" }), `clip.${ext}`);
    return fetch("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: outbound,
      signal: AbortSignal.timeout(55_000),
    });
  };

  try {
    let res = await send();
    if (res.status === 429 || res.status >= 500) res = await send();
    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, error: "Transkription ist gerade nicht berechtigt." }, 502);
    }
    if (!res.ok) {
      console.error("[runde] stt failed", res.status);
      return json({ ok: false, error: "Die Transkription antwortet gerade nicht." }, 502);
    }
    const body = (await res.json()) as { text?: unknown; language?: unknown; duration?: unknown; words?: unknown };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 50_000) : "";
    const cues = wordsToCues(readWords(body.words), text).slice(0, 400);
    const detected = typeof body.language === "string" ? body.language : "";
    const duration = typeof body.duration === "number" ? body.duration : 0;
    if (!text && !cues.length) {
      return json({
        ok: true,
        text: "",
        language: detected,
        duration,
        cues: [],
        translations: null,
        translation: null,
        translationError: null,
        note: "Keine Sprache in der Datei erkannt.",
      });
    }
    const pack = translate ? await translateCues(cues, translate) : { lines: null, block: null, error: null };
    return json({
      ok: true,
      text,
      language: detected,
      duration,
      cues,
      translations: pack.lines,
      translation: pack.block,
      translationError: pack.error,
      note: null,
    });
  } catch (error) {
    console.error("[runde] transcribe failed", error);
    return json({ ok: false, error: "Die Transkription ist nicht erreichbar." }, 502);
  }
}
