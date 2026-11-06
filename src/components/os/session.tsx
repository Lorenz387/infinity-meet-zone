import { useState } from "react";
import { applyPack, downloadExport, parsePack, packSummary, type ArcPack } from "@/lib/os/pack";

export function SessionBar({ onStatus }: { onStatus?: (text: string) => void }) {
  const [pack, setPack] = useState<ArcPack | null>(null);
  const [note, setNote] = useState("");

  function say(text: string) {
    setNote(text);
    onStatus?.(text);
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs text-mist">Von Rechner zu Rechner</p>
      <p className="mt-1 text-sm text-paper">Export speichert eine Datei, infinity-meet-zone-export. Darin liegen der Schreibtisch, die Akten und der lesbare Text. Sie liegt auch in der Ablage. Einklinken setzt sie auf diesem Rechner fort.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void downloadExport().then(say).catch(() => say("Die Datei konnte nicht gespeichert werden."));
          }}
          className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink"
        >
          Export
        </button>
        <label className="grid h-11 cursor-pointer place-items-center rounded-full border border-line px-4 text-sm text-paper">
          Einklinken
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 8_000_000) {
                say("Die Datei ist zu groß.");
                return;
              }
              void file.text().then((raw) => {
                const next = parsePack(raw);
                if (!next) {
                  setPack(null);
                  say("Das ist keine Sitzung aus diesem System.");
                  return;
                }
                setPack(next);
                say(packSummary(next));
              });
            }}
          />
        </label>
        {pack ? (
          <button
            type="button"
            onClick={() => {
              void applyPack(pack)
                .then((text) => {
                  setPack(null);
                  say(text);
                })
                .catch(() => say("Die Sitzung ließ sich nicht einklinken."));
            }}
            className="h-11 rounded-full border border-line px-4 text-sm text-paper"
          >
            Übernehmen
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm text-mist">{note}</p> : null}
    </div>
  );
}
