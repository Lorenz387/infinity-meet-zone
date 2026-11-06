import { useEffect, useState } from "react";
import { bookingPlace, wantsScriptLook, widgetCopy, widgetsFor } from "@/lib/os/intents";
import { patchLook, loadLook } from "@/lib/os/look";
import { addCard, updateLive } from "@/lib/os/sheets";
import type { CaptionLine } from "@/lib/meet/use-call";

const seen = new Set<string>();

export function ArcEngine({
  room,
  captions,
  sayAs,
}: {
  room: string;
  captions: CaptionLine[];
  sayAs: (speaker: string, text: string) => void;
}) {
  const [booking, setBooking] = useState<{ place: string } | null>(null);

  useEffect(() => {
    const fresh = captions.filter((line) => !seen.has(line.id));
    if (!fresh.length) return;
    for (const line of fresh) seen.add(line.id);
    updateLive(room, (sheet) => {
      let cards = sheet.cards;
      for (const line of fresh) {
        if (sheet.heard.some((item) => item.id === line.id)) continue;
        const heard = { id: line.id, at: line.at, name: line.name, text: line.text };
        sheet = { ...sheet, heard: [...sheet.heard, heard].slice(-8) };
        for (const widget of widgetsFor(line.text)) {
          const copy = widgetCopy(widget, line.text);
          const id = `todo:${line.id}`;
          cards = [{ id, at: line.at, kind: "widget" as const, widget, ...copy }, ...cards.filter((card) => card.id !== id)];
        }
        const place = bookingPlace(line.text);
        if (place) setBooking({ place });
        if (loadLook().allow && wantsScriptLook(line.text)) {
          patchLook({ scale: "read", contrast: true });
          if (!cards.some((card) => card.id === "look-script")) {
            cards = [
              {
                id: "look-script",
                at: line.at,
                kind: "note" as const,
                text: "Darstellung nur bei dir: größere Schrift, schärferer Kontrast, damit das Skript lesbar ist.",
              },
              ...cards,
            ];
          }
        }
      }
      return { ...sheet, cards: cards.slice(0, 40) };
    });
  }, [captions, room]);

  if (!booking) return null;

  function settle(status: "freigegeben" | "abgelehnt") {
    if (!booking) return;
    addCard(room, {
      id: `booking:${Date.now()}`,
      at: Date.now(),
      kind: "booking",
      place: booking.place,
      status,
    });
    sayAs(
      "Notiz",
      status === "freigegeben"
        ? `Tisch in ${booking.place} ist vorgemerkt und liegt auf dem Blatt. Eine Zahlung wurde nicht ausgelöst.`
        : `Tisch in ${booking.place} ist nicht weitergegeben.`,
    );
    setBooking(null);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-5" role="dialog" aria-labelledby="hitl-title">
        <p className="text-sm text-copper">Freigabe</p>
        <h2 id="hitl-title" className="mt-1 font-display text-3xl text-paper">
          Tisch vormerken
        </h2>
        <p className="mt-3 text-sm text-mist">
          Ein Tisch in {booking.place} kann auf dem Blatt stehen. Es wird nichts abgebucht und nichts verschickt, bis du es selbst tust.
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => settle("freigegeben")} className="h-11 flex-1 rounded-full bg-copper text-sm font-medium text-ink">
            Vormerken
          </button>
          <button type="button" onClick={() => settle("abgelehnt")} className="h-11 flex-1 rounded-full border border-line text-sm text-paper">
            Nicht jetzt
          </button>
        </div>
      </div>
    </div>
  );
}
