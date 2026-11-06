import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Missing } from "@/components/os/legal";

export const Route = createFileRoute("/impressum")({ component: Impressum });

function Impressum() {
  return (
    <LegalPage title="Impressum">
      <section>
        <h2 className="font-display text-2xl">Anbieter</h2>
        <p className="mt-2">Die Pflichtangaben nach dem Digitale-Dienste-Gesetz kann ich nicht ausfüllen. Sie liegen mir nicht vor. Eine erfundene Anschrift wäre selbst ein Fehler.</p>
        <div className="mt-3 space-y-1">
          <Missing label="Name und Rechtsform" />
          <Missing label="Ladungsfähige Anschrift" />
          <Missing label="E-Mail und Telefon" />
          <Missing label="Vertretungsberechtigte Person" />
          <Missing label="Register und Registernummer" />
          <Missing label="Umsatzsteuer-Identifikationsnummer" />
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Was die Anwendung ist</h2>
        <p className="mt-2">
          Infinity-Meet-Zone ist ein Schreibtisch für Gespräche. Es wird nichts verkauft. Es gibt keinen Preis, keinen Warenkorb und keine Kundenbewertungen. Die Demo Atelier Nord ist ein Beispiel, kein Auftrag und keine Rezension.
        </p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Verantwortlich für den Inhalt</h2>
        <Missing label="Name und Anschrift" />
      </section>
    </LegalPage>
  );
}
