import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { translateLabel } from "@/lib/meet/languages";

const LANGS = [
  "de",
  "en",
  "fr",
  "es",
  "it",
  "pl",
  "tr",
  "uk",
  "ru",
  "ar",
  "zh",
  "ja",
  "pt",
  "nl",
] as const;

const inputSchema = z.object({
  lang: z.enum(LANGS),
  lines: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
});

export type TranslateResult =
  | { ok: true; lines: string[] }
  | { ok: false; error: string };

const bucket = globalThis as typeof globalThis & {
  __rundeTrHits?: number[];
  __rundeTrCache?: Map<string, string[]>;
};

function allowTranslate(): boolean {
  const now = Date.now();
  const hits = (bucket.__rundeTrHits ?? []).filter((stamp) => now - stamp < 60_000);
  if (hits.length >= 30) {
    bucket.__rundeTrHits = hits;
    return false;
  }
  hits.push(now);
  bucket.__rundeTrHits = hits;
  return true;
}

function remember(key: string, lines: string[]) {
  const cache = bucket.__rundeTrCache ?? new Map<string, string[]>();
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, lines);
  bucket.__rundeTrCache = cache;
}

function splitTranslations(raw: string, count: number): string[] | null {
  if (count === 1) {
    const text = raw.trim();
    return text ? [text] : null;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)\]]\s*/, "").replace(/^[-–•]\s*/, ""));
  return lines.length === count ? lines : null;
}

export async function translateLinesWithGrok(lines: string[], lang: string): Promise<TranslateResult> {
  const clean = lines.map((line) => line.trim()).filter(Boolean).slice(0, 12);
  if (!clean.length) return { ok: false, error: "Nichts zu übersetzen." };
  if (!LANGS.includes(lang as (typeof LANGS)[number])) {
    return { ok: false, error: "Diese Sprache ist nicht auswählbar." };
  }
  const key = `${lang}\n${clean.join("\n")}`;
  const cached = bucket.__rundeTrCache?.get(key);
  if (cached) return { ok: true, lines: cached };
  if (!allowTranslate()) {
    return { ok: false, error: "Zu viele Übersetzungen gerade. Einen Moment warten." };
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Übersetzung ist in dieser Umgebung nicht verbunden." };

  const target = translateLabel(lang);
  const system = [
    `You translate spoken lines into ${target}.`,
    "Return exactly one translation per input line.",
    "Separate the translations with a single newline.",
    "Do not number lines, add quotes, or explain anything.",
    "Keep each translation on one line.",
    "Keep names and numbers as spoken.",
    "If a line is already in the target language, copy it unchanged.",
  ].join(" ");
  const payload = {
    model: "grok-4.5",
    temperature: 0.2,
    max_tokens: clean.length === 1 ? 400 : 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: clean.join("\n") },
    ],
  };
  const run = () =>
    fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });
  try {
    let res = await run();
    if (res.status === 429 || res.status >= 500) res = await run();
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Übersetzung ist gerade nicht berechtigt." };
    }
    if (!res.ok) return { ok: false, error: "Übersetzung antwortet gerade nicht." };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = splitTranslations(raw, clean.length);
    if (!parsed) return { ok: false, error: "Die Übersetzung kam unvollständig zurück." };
    const lines = parsed.map((line) => line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 500));
    remember(key, lines);
    return { ok: true, lines };
  } catch (error) {
    console.error("[runde] translate failed", error);
    return { ok: false, error: "Übersetzung ist nicht erreichbar." };
  }
}

export const translateUtterances = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<TranslateResult> => translateLinesWithGrok(data.lines, data.lang));
