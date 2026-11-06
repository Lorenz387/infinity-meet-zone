import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="inhalt" className="studio min-h-dvh px-4 py-8 text-paper sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-mist">
          <Link to="/" className="text-paper underline-offset-4 hover:underline">
            Zum Schreibtisch
          </Link>
        </p>
        <h1 className="mt-4 font-display text-4xl text-paper">{title}</h1>
        <aside className="mt-4 rounded-2xl border border-copper bg-panel p-4 text-sm text-paper">
          <p className="font-medium text-copper">Mit dem Anwalt klären</p>
          <p className="mt-1">
            Dieser Text beschreibt nur, was die Anwendung wirklich tut. Er ist keine Rechtsberatung. Felder ohne deine Angaben sind leer gelassen und nicht erfunden.
          </p>
        </aside>
        <div className="mt-6 space-y-6 text-sm leading-relaxed">{children}</div>
      </div>
    </main>
  );
}

export function Missing({ label }: { label: string }) {
  return (
    <p>
      <span className="text-mist">{label}: </span>
      <strong className="text-copper">fehlt. Nicht einsetzen, bevor du es selbst geprüft hast.</strong>
    </p>
  );
}
