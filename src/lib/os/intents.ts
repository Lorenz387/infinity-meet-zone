import type { WidgetKind } from "@/lib/os/types";

export function widgetsFor(text: string): WidgetKind[] {
  if (/\b(aufgabe|todo|to-do)\b|nicht vergessen|wir müssen|müssen wir/i.test(text)) return ["todo"];
  return [];
}

export function widgetCopy(_kind: WidgetKind, said: string): { title: string; body: string } {
  return { title: "Aufgabe", body: said.trim().slice(0, 220) };
}

export function bookingPlace(text: string): string | null {
  if (!/\b(tisch|reservier\w*|buche|buch )\b/i.test(text)) return null;
  const matches = [...text.matchAll(/(?:im|in|bei)\s+([^.,!?\n]+)/giu)];
  const place = matches.at(-1)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
  return (place || "dem genannten Restaurant").slice(0, 80);
}

export function wantsScriptLook(text: string): boolean {
  return /\bskript\b|\bcode\b/i.test(text);
}

export function packContext(input: {
  now: number;
  room: string;
  captions: { name: string; text: string; at: number }[];
  screen: string | null;
}): string {
  const recent = input.captions.filter((line) => input.now - line.at <= 120_000);
  const talk = recent.length
    ? recent.map((line) => `${line.name}: ${line.text}`).join("\n")
    : "In den letzten zwei Minuten liegt nichts im Transkript.";
  return [`Raum ${input.room}`, `Stand ${new Date(input.now).toLocaleString("de-DE")}`, `Bildschirm: ${input.screen ?? "niemand teilt"}`, "Gesagt, letzte zwei Minuten:", talk]
    .join("\n")
    .slice(0, 4000);
}
