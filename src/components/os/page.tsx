import { useEffect, useState } from "react";
import { cleanPageUrl, loadPageUrl, savePageUrl } from "@/lib/os/page";
import { getDraft, putDraft } from "@/lib/os/drafts";

export function PageFrame() {
  const [draft, setDraft] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("Wenn die Seite leer bleibt, verbietet sie das Einbetten.");

  useEffect(() => {
    const pull = () => {
      const saved = loadPageUrl();
      setUrl(saved);
      setDraft(getDraft("page") || saved);
    };
    pull();
    window.addEventListener("arc-page", pull);
    return () => window.removeEventListener("arc-page", pull);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex gap-2 border-b border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next = savePageUrl(draft);
          if (!next) {
            setNote("Die Adresse trägt nicht.");
            return;
          }
          setUrl(next);
          setNote("Wenn die Seite leer bleibt, verbietet sie das Einbetten.");
        }}
      >
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            putDraft("page", event.target.value);
          }}
          placeholder="https://"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm text-paper"
        />
        <button type="submit" className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
          Öffnen
        </button>
      </form>
      <p className="px-4 py-2 text-sm text-mist">
        {note}{" "}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-copper">
            Daneben öffnen
          </a>
        ) : null}
      </p>
      {url && cleanPageUrl(url) ? (
        <iframe title={url} src={url} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0 bg-paper" />
      ) : (
        <p className="px-4 text-sm text-mist">Noch keine Seite.</p>
      )}
    </div>
  );
}
