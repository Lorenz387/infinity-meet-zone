import { useEffect, useState } from "react";
import { readConsent, saveConsent, type Consent } from "@/lib/os/consent";

export function ConsentBanner() {
  const [choice, setChoice] = useState<Consent | "">("");

  useEffect(() => {
    const saved = readConsent();
    if (saved) setChoice(saved);
  }, []);

  if (choice) return null;

  function pick(value: Consent) {
    saveConsent(value);
    setChoice(value);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-panel px-4 py-4 pad-safe" role="dialog" aria-labelledby="consent-title" aria-describedby="consent-body">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="consent-title" className="font-display text-xl text-paper">
            Cookies
          </h2>
          <p id="consent-body" className="mt-1 max-w-xl text-sm text-paper">
            Es wird kein Analyse-Werkzeug geladen, weder vorher noch nach dem Ablehnen. Notwendiges bleibt auf diesem Rechner: der Schreibtisch und, wenn du dich anmeldest, die Anmeldung. Annehmen schaltet heute nichts Zusätzliches ein.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => pick("necessary")} className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
            Alles ablehnen
          </button>
          <button type="button" onClick={() => pick("all")} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
            Annehmen
          </button>
        </div>
      </div>
    </div>
  );
}
