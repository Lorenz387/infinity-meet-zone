export type WidgetKind = "todo";

export type Verdict = "match" | "stale" | "off";

export type SheetCard =
  | { id: string; at: number; kind: "widget"; widget: WidgetKind; title: string; body: string }
  | {
      id: string;
      at: number;
      kind: "audit";
      claim: string;
      verdict: Verdict;
      headline: string;
      detail: string;
      source: string;
      row: string;
    }
  | { id: string; at: number; kind: "task"; title: string; body: string; done?: boolean }
  | { id: string; at: number; kind: "mail"; subject: string; body: string }
  | { id: string; at: number; kind: "booking"; place: string; status: "offen" | "freigegeben" | "abgelehnt" }
  | { id: string; at: number; kind: "note"; text: string };

export type HeardLine = { id: string; at: number; name: string; text: string };

export type ProtocolSheet = {
  id: string;
  room: string;
  title: string;
  updatedAt: number;
  pinUntil: number | null;
  heard: HeardLine[];
  cards: SheetCard[];
};
