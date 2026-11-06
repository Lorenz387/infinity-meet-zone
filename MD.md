# Infinity-Meet-Zone

Die Akte ist das Produkt. Ein Gespräch, das danach noch antwortet, und eine Entscheidung, die bei der Person bleibt, die sie getroffen hat.

Infinity-Meet-Zone ist ein Betriebssystem im Browser für die eigene Arbeit und für gemeinsame Gespräche. Die Oberfläche ist deutsch. Der Schreibtisch ist dunkel. Überschriften stehen in Fraunces, der Rest in Outfit. Es gibt kein Konto. Was du anlegst, bleibt zuerst auf diesem Rechner und geht nur dorthin, wohin du es ausdrücklich schickst.

Eine Million wäre viele kleine Runden, die dafür zahlen, dass der Stand am nächsten Morgen noch stimmt. Eine Milliarde wäre ein anderes Produkt: der Ort, an dem Arbeit verteilt wird. Das ist dies nicht. Ein Preis steht nicht in der Oberfläche.

## Was es nicht ist

- Kein Jira, kein Trello, kein Asana, kein CRM, kein Kalenderanschluss.
- Keine Stimmung, keine erfundenen Ersparnisse, keine Zahlung, kein Checkout.
- Keine Konten und keine Rechte. Wer den Code kennt, kann schreiben.
- Arcy entscheidet nichts. Arcy liest, was gespeichert ist, und sagt, wenn nichts da ist.
- Kein VR, kein Zwilling, kein Wissensgraph.
- Kein TURN. Hinter zwei strengen Netzen kann Ton und Bild scheitern.
- Ein Bild von der Prüfung oder von der Tageszone wird nicht gespeichert und nicht an die anderen geschickt.

## Der Schreibtisch

Oben liegt **Befehl an Arcy**. Enter führt den Satz aus. Darunter steht, was gerade passiert ist. Fenster öffnest du über die Leiste unten. Ein Fenster lässt sich ziehen, beiseitelegen und schließen. Lage und Zettel überleben einen Neustart (`arc-desk-v1`).

| Fenster | Was es tut |
|---|---|
| Arcy | Anrede, Ton (knapp, ruhig, direkt), Notiz. Das hängt an den Antworten. |
| Tag | Tagesplan, Routine, Reflexion |
| Datei | Ablage im Browser |
| Seite | Eine Webseite im Fenster |
| Blätter | Protokolle |
| Zone | Das Bildgespräch |
| Transkript | Aufnahme in Text |
| Gedanke | Satz auf die Kamera, Workflow |
| Einbinden | Dasselbe Gespräch in eine andere Seite |
| Hub | Eine Aufnahme, höchstens zwei Minuten. Kommentare liegen an der Sekunde, auf diesem Rechner. |

Auf dem Tisch liegen Auftragskarten, Protokollkarten und Zettel. Ein Auftrag hat einen Kunden, eine Art (Web, Film, Event, Laden, Dienst), einen Satz, einen Status (offen, läuft, fertig), eine Uhrzeit, einen Ort, eine Crew und eine Freigabe. Der Raumcode eines Auftrags ist der gefaltete Name. `Müller` wird `mueller`.

Befehle, die lokal laufen, ohne das Modell zu fragen:

- `Notiz …` — Zettel
- `Protokoll …` — Blatt
- `Auftrag Müller Film Dreh am Freitag`
- `Zeit 16:30 Müller`, `Ort Studio Müller`, `Crew Kim Kamera Müller`, `Frei Schnitt steht Müller`
- `Übergabe` — ein Zettel mit dem Tag
- `Seite example.com`
- `Einblendung …` — Satz auf die Kamera
- `Gedanke …`, `Ablauf …`, `Nächster Schritt`
- `Mitnehmen` — Sitzungsdatei
- `Gemeinsam werkstatt`, `Allein`
- `öffne Tag`, Schrift und Kontrast
- `Führung`, `Demo`

Alles andere, das wie eine Frage klingt, geht an Arcy. Ohne Schlüssel bleibt die Meldung, dass keine Antwort kam. Demo lädt Atelier Nord als Beispiel, keinen Kundenauftrag.

## Die Akte

Die Akte liest die Räume eines Auftrags, ohne die Kamera einzuschalten. Sie zeigt nur Gespeichertes: was jetzt dran ist, was durchgegangen wurde, was entschieden ist, wer dabei war, was offen ist, was erledigt ist, die letzte Zeile, der Satz auf der Kamera.

| Knopf | Was er tut |
|---|---|
| Akte | Liest die Räume des Auftrags. |
| Frag die Akte | Stellt eine Frage nur an diesen Text. Die Anweisung heißt: lies nur diese Akte, erfinde nichts. |
| Text | Kopiert die Akte, damit ein anderes Werkzeug sie lesen kann. Kein Anschluss an ein fremdes System. |
| Schreiben | Legt eine benannte Zeile in den ersten Raum, ohne Kamera. |
| Weiterer Raum | Hängt einen weiteren Code an denselben Auftrag, höchstens fünf Räume. |

Eine leere spätere Fassung löscht keine Zeile, keine Aufgabe und keine Entscheidung. Ein leerer Raum ersetzt keinen vollen.

## Wem eine Zeile gehört

Schreiben braucht den Namen aus Gemeinsam. Leer oder `Gast` wird abgelehnt.

- Eine Zeile bleibt bei dem echten Namen, der sie geschrieben hat.
- Ein anderer Name und auch Gast überschreiben weder den Namen noch den Text.
- Dieselbe Person darf ihre eigene Zeile später korrigieren.

## Wem eine Entscheidung gehört

Dieselbe Grenze gilt für Entscheidungen, im Raum und in der Akte, wenn derselbe Punkt in zwei Räumen liegt.

- Ein echter Name behält die Entscheidung.
- Ein anderer Name und Gast setzen sich nicht darunter, auch nicht mit einem älteren Zeitstempel und auch nicht über eine erledigte Aufgabe.
- Steht kein echter Name daran, kann sich später niemand darunter setzen.
- Dieselbe Person darf ihre eigene Entscheidung später korrigieren. Der Name bleibt ihrer.
- Erledigt bleibt erledigt. Ein leerer Raum wischt die Entscheidung nicht weg.

Geprüft: Ada entscheidet „Ton“. Ben früher, Ben später und Gast lassen „Ton · Ada“ stehen. Ada selbst kann daraus später „Ton bleibt · Ada“ machen.

## Sitzungen

Bis zu vier Räume sind gleichzeitig offen. Jeder hat seine eigenen Personen und seine eigene Akte. Ton und Kamera hängen an genau einem Raum, über **Im Bild**. Die anderen bleiben zum Schreiben offen. Eine fünfte Sitzung wird abgelehnt, bis eine geschlossen wird.

Die Tageszone hat den Code des Tages, `tag` und das Datum, zum Beispiel `tag20261106`. Sie liegt beim ersten Öffnen schon da, wenn noch ein Platz frei ist. Wer sie schließt, bekommt sie an diesem Tag nicht von allein wieder.

| Knopf | Was er tut |
|---|---|
| Sitzung | Öffnet einen weiteren Code. |
| Heute | Öffnet die Tageszone. |
| Im Bild | Legt Ton und Kamera in diesen einen Raum. Läuft das Bild schon hier, steht **Bild hier**. |
| Zu | Schließt diese Sitzung. Lief das Bild hier, ist es danach aus. |
| Schreiben | Eine benannte Zeile in den gewählten Raum, ohne Kamera. |
| Kennen | Liest die offenen Sitzungen und sagt nur, was gespeichert ist. Kein Modell. |
| Kamera an | Vorschau nur für Arcy. Nicht für die Runde. |
| Schau | Ein Blick, nur wenn du ihn auslöst. |
| Live | Höchstens vier Blicke, dann Ruhe. |
| Prüfung | Öffnet jedes gemeldete Bildgerät kurz, nennt was ankommt, und lässt es wieder los. |

Kennen sagt pro Sitzung einen Satz: die letzte Zeile, sonst die Entscheidung, sonst den aktuellen Punkt, sonst „Gespeichert: nichts.“ Der volle Stand bleibt als Text unter den Sitzungen stehen. Spätere Antworten dürfen nur diesen Block, das Handbuch, den Tisch und ein Bild nutzen, wenn du eins geschickt hast.

Prüfung geht die Kameras durch, die der Browser wirklich meldet, höchstens acht. Ein laufendes Gespräch wird dafür nicht angefasst. War die Vorschau der Tageszone an, geht sie aus und bleibt aus. Fehlt ein Gerät oder ist der Zugriff blockiert, steht der Grund da. Nichts wird gespeichert.

## Das Gespräch

Es gibt zwei Orte für Ton und Bild. Beide nutzen dasselbe Netz.

**Zone** (`/r/CODE`, eingebettet `/embed/r/CODE`) ist das volle Gespräch: Lobby, Warteraum, Live-Bild, Bildschirm teilen, Chat, Reaktionen, Hand heben, Untertitel, Übersetzung, Aufnahme, Gerätewahl, Galerie oder Fokus. Bis zu sechs Personen. Das Gespräch bleibt im Speicher, wenn du auf den Schreibtisch zurückgehst. Nach einem Neuladen liegt zwölf Stunden eine Leiste **Zurück**. Sie wählt nicht von allein wieder ein.

**Ton und Bild** auf dem gemeinsamen Schreibtisch ist das kleinere Gespräch im selben Code. Die eigene Kachel ist stumm und gespiegelt. **Ton aus** nimmt nur die eigene Stimme weg. **Auflegen** legt nur dieses Gespräch weg.

Wer später dazukommt, sieht in der Kamera, was in diesem Raum schon gesagt, abgehakt und offen ist. Derselbe Verlauf liegt gespeichert, nicht nur auf dem Bild.

### Wie die Verbindung läuft

1. Der Browser öffnet Mikrofon und, wenn du es willst, Kamera.
2. Er tritt dem Raum bei. Die Kennung für die Stimme liegt in diesem Tab.
3. `/api/rtc` sagt, wer noch da ist.
4. Für jede andere Person gibt es eine eigene Verbindung. Die Kennung, die alphabetisch größer ist, macht das Angebot.
5. Angebot, Antwort und ICE legt der Server kurz ab. Die Stimme geht danach von Browser zu Browser.
6. Zum Finden der öffentlichen Adresse dienen STUN-Server. Einen TURN-Server gibt es nicht.
7. Läuft schon ein Gespräch, öffnet der Schreibtisch kein zweites Mikrofon. Die Kamera der Tageszone bleibt dann aus: dort sieht dich die Runde, nicht Arcy.

Der Satz auf der Kamera liegt in `arc-cue`. In der Zone wird er unten ins ausgehende Bild gezeichnet. **Aus** schickt wieder das reine Bild. Das kleinere Gespräch auf dem Schreibtisch schickt das Bild ohne diesen Satz.

## Gemeinsam

**Dabei** oder `gemeinsam werkstatt` öffnet einen gemeinsamen Schreibtisch. Bis zu acht Personen. Der Code hat 4 bis 12 Buchstaben oder Ziffern. Wer 20 Sekunden nichts mehr sagt, fällt aus der Liste.

Alle zwei Sekunden fragt der Browser `/api/share`. Geschickt werden Aufträge, Protokolle, Zettel und der Satz für alle. Nicht mitgeschickt werden Dateien, die Reflexion und das Profil. Passt nicht alles auf die Leitung, geht eine Kurzfassung hinaus und der volle Stand bleibt hier.

Die Fassung hat eine Nummer. Kommt deine Nummer zu spät, kommt der neuere Stand zurück, wird lokal gemischt und noch einmal geschickt. Stand, Uhrzeit und Ort eines Auftrags bleiben, wenn jemand ein anderes Feld ändert.

Die Sitzungen fragen dieselbe Anwesenheit ab, ohne den fremden Schreibtisch zu übernehmen. Der eigene Beobachter steht nicht in der Personenliste.

**Allein** trägt dich aus und beendet Ton und Bild dieser Sitzung.

## Arcy

Arcy ist ein Leser.

| Weg | Was passiert |
|---|---|
| Kennen | Nur der gespeicherte Stand der offenen Sitzungen. Kein Modell. |
| Frag die Akte | Nur der Text der Akte. |
| Schau und Live | Ein Bild nur, wenn die Kamera an ist und du den Blick auslöst. Das Bild geht an das Modell und wird nicht behalten. |
| Sprechen | Der Browser erkennt den Satz, wenn er das kann. Sonst steht: Zuhören geht gerade nicht. |
| Frage im Feld | Darf nur sagen, was im Handbuch, auf dem Tisch, im gelernten Block oder im Bild steht. |

Das Modell ist grok-4.5, höchstens zwölf Aufrufe in der Minute, nur wenn ein Schlüssel auf dem Server liegt. Ohne Schlüssel kommt keine erfundene Antwort. Ohne Kamera tut Arcy nicht so, als würde er sehen.

## Tag, Dateien, Protokoll

Der Tag sortiert Aufträge nach Uhrzeit. **Jetzt** setzt den Auftrag auf läuft, schreibt eine Zeile ins Protokoll und legt den Satz auf die Kamera. Die Routine wechselt mit der Uhr: Morgen bis 11, Tag bis 17, danach Abend. Die Reflexion hat drei Felder und bleibt auf diesem Rechner, höchstens 14 Tage. Sie geht nicht in die gemeinsame Sitzung.

Dateien liegen in IndexedDB (`arc-files`). Eine Datei darf 8 MB haben, es passen 16 Stück. **Auf den Tisch** legt nur den Namen als Zettel.

Ein Protokoll hält die letzten gehörten Zeilen und Karten: Aufgabe, Notiz, Mail, Buchung. Eine Buchung wird nicht abgebucht. Dieselbe Zeile wird nicht doppelt angehängt. Ein Blatt lässt sich für einen Tag oder einen Monat anheften.

Untertitel nutzen die Spracherkennung des Browsers. Die ist nicht überall gleich gut.

## Von Rechner zu Rechner

**Mitnehmen** speichert `arc-sitzung-DATUM.json`: Profil, Schrift, Aufträge, Protokolle, Zettel, Routine, Reflexion, die letzte Seitenadresse und kleine Dateien. Eine Datei über etwa 1,5 MB bleibt auf dem ersten Rechner. Die ganze Datei darf 8 MB nicht überschreiten.

Auf dem anderen Rechner: **Einklinken**, dann **Übernehmen**. Derselbe Auftrag: der neuere Zeitstempel gewinnt. Zeilen und Karten werden nach Kennung zusammengeführt. Zettel, die es schon gibt, werden nicht verdoppelt.

## Was wo liegt

| Ort | Inhalt |
|---|---|
| Dieser Rechner | Schreibtisch, Aufträge, Blätter, Profil, Dateien, Routine, Reflexion, offene Sitzungen, das Gespräch der Tageszone |
| `arc_memory` | Die Akte eines Raums. Leer überschreibt nicht. Zeile und Entscheidung bleiben beim Namen. Ab 2000 Räumen fallen die ältesten. |
| `arc_share` | Die Fassung des gemeinsamen Schreibtischs |
| `arc_share_people` | Wer bei Dabei ist, etwa 20 Sekunden |
| `arc_agenda` | Der Ablauf eines Raums |
| `webrtc_peers`, `webrtc_signals` | Wer im Gespräch ist, und das kurze Aushandeln. Danach läuft die Stimme direkt. |

In der Vorschau ist das eine lokale Datenbank. Mit `DATABASE_URL` ist es Postgres. Die Räume haben keinen Besitzer.

Routen: `/` der Schreibtisch, `/r/$code` das Gespräch, `/embed/r/$code` dasselbe zum Einbetten, `/api/memory`, `/api/share`, `/api/rtc`, `/api/agenda`, `/api/transcribe`.

## Grenzen, die bleiben

- Acht Personen am Tisch, sechs mit Ton und Bild, vier offene Sitzungen, eine Kamera.
- Kein zweites Mikrofon neben einem laufenden Gespräch.
- Eine Seite, die das Einbetten verbietet, bleibt leer.
- Die Mediendatei eines Transkripts bleibt nicht, nur der Text. Geht der Speicher zur Neige, weichen zuerst alte Transkripte, nicht die Aufträge.
- Konten kommen erst, wenn eine Person bleiben soll und ein Raum nicht mehr von jedem mit dem Code überschrieben werden darf. Bis dahin ist der Name die Grenze, nicht ein Recht.

## Zum Benutzen

1. Unter Gemeinsam einen echten Namen setzen. Nicht Gast.
2. Einen Auftrag anlegen oder `Auftrag Müller Film Dreh am Freitag`.
3. **Sitzung** oder **Heute** öffnen. Mit **Schreiben** eine Zeile hinterlassen.
4. **Kennen** sagt, was in den offenen Räumen liegt. Leere Räume bleiben leer.
5. **Akte**, dann **Text**, wenn ein anderes Werkzeug den Stand lesen soll.
6. **Im Bild**, wenn dieser eine Raum euch hören und sehen soll.
7. **Prüfung**, wenn jedes gemeldete Bildgerät einmal sagen soll, was ankommt.
8. **Mitnehmen**, wenn der Schreibtisch auf einen anderen Rechner soll.
