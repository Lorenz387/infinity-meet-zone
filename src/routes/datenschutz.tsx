import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Missing } from "@/components/os/legal";

export const Route = createFileRoute("/datenschutz")({ component: Datenschutz });

function Datenschutz() {
  return (
    <LegalPage title="Datenschutz">
      <section>
        <h2 className="font-display text-2xl">Verantwortliche Stelle</h2>
        <p className="mt-2">Ohne Namen und Anschrift ist diese Erklärung unvollständig. Dieselben Lücken stehen im <Link to="/impressum" className="underline underline-offset-4">Impressum</Link>.</p>
        <div className="mt-3 space-y-1">
          <Missing label="Verantwortliche Person" />
          <Missing label="Kontakt für Datenschutz" />
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Auf diesem Rechner</h2>
        <p className="mt-2">Auftrag, Protokoll, Zettel, Routine, Reflexion, offene Sitzungen und hochgeladene Dateien liegen im Browser dieses Geräts. Eine Datei wird nicht auf einen Server gestellt. Höchstens 16 Dateien, jede höchstens 8 MB. Mitnehmen speichert eine Datei nur, wenn du sie selbst herunterlädst.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Auf dem Server, wenn du einen Raum benutzt</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Die Akte eines Raums: Zeilen, Aufgaben, Entscheidungen. Wer den Code kennt, kann sie lesen.</li>
          <li>Der gemeinsame Schreibtisch: Aufträge, Protokolle, Zettel, der Satz. Nicht die Dateien und nicht die Reflexion.</li>
          <li>Der Ablauf eines Raums.</li>
          <li>Für Ton und Bild nur die kurze Vermittlung: wer da ist, Angebot und Antwort. Die Stimme geht danach von Browser zu Browser.</li>
        </ul>
        <p className="mt-2">Ein leerer Stand löscht eine vorhandene Zeile oder Entscheidung nicht. Ist ein Konto angemeldet, schreibt der Server eine neue Zeile auf diesen Kontonamen, nicht auf einen anderen Namen im Formular.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Konto</h2>
        <p className="mt-2">Die Anmeldung läuft über das Konto dieser Anwendung. Angeboten werden Google und X. Die Anwendung sieht nicht das Passwort bei Google oder X. Gespeichert werden die Kennung des Kontos, der Name und die E-Mail, die der Anbieter meldet, dazu eine Sitzung. Abmelden beendet die Sitzung hier.</p>
        <p className="mt-2 text-copper">Mit dem Anwalt klären: ob diese Anmeldung für deinen Einsatz die richtige Rechtsgrundlage hat, und wo die Kontodaten liegen, sobald die Anwendung veröffentlicht ist.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Arcy</h2>
        <p className="mt-2">Eine Frage, Frag die Akte, Schau und Live gehen nur auf deinen Knopf an das Modell grok-4.5. Mitgeht der Text, den du siehst, und nur dann ein Bild, wenn die Kamera an ist und du den Blick auslöst. Das Bild wird nicht in den Raum gelegt und nicht in der Akte gespeichert. Ohne Schlüssel auf dem Server kommt keine Antwort. Kennen rechnet nur auf diesem Rechner und schickt nichts.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Ton, Bild und Schriften</h2>
        <p className="mt-2">Beim Gespräch fragt der Browser öffentliche STUN-Server von Google und Cloudflare nach dem Weg. Dabei kann deine IP-Adresse dort ankommen. Die anderen Personen im Raum bekommen Ton und Bild direkt. Schriften liegen in der Anwendung. Es wird keine Schrift von Google nachgeladen.</p>
        <p className="mt-2 text-copper">Mit dem Anwalt klären: ob die STUN-Abfrage für deinen Einsatz zulässig ist. Einen Umweg über einen eigenen Server gibt es nicht. Hinter manchen Netzen kommt das Gespräch deshalb nicht zustande.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Cookies und Analyse</h2>
        <p className="mt-2">Es gibt kein Analyse-Werkzeug. Vor einer Entscheidung wird keins geladen, und auch danach nicht, weil keins eingebaut ist. Alles ablehnen speichert nur diese Entscheidung auf diesem Rechner. Die Anmeldung setzt ein notwendiges Sitzungs-Cookie, sobald du dich anmeldest.</p>
      </section>
      <section>
        <h2 className="font-display text-2xl">Was nicht vorkommt</h2>
        <p className="mt-2">Kein Verkauf, keine Preise, keine Zahlungsdaten, keine Kundenbewertungen, keine erfundenen Sterne. Kein Jira, kein Trello, kein Asana. Die Plattform, auf der die Anwendung ausgeliefert wird, kann eigene Hinweise einblenden. Die kann diese Seite nicht abschalten.</p>
        <p className="mt-2 text-copper">Mit dem Anwalt klären: Auftragsverarbeitung, Speicherort, Löschfristen und ob der Raumcode als Schutz reicht. Er reicht technisch nur so lange, wie niemand sonst den Code kennt.</p>
      </section>
    </LegalPage>
  );
}
