# Technische Machbarkeit

Stand: der Code, wie er am 6. November 2026 liegt. Das Konzept steht in [MD.md](MD.md). Hier steht nur, was dieser Bau trägt, wo er bricht, und was ein anderer Bau wäre.

Kurz: für eine kleine Runde auf diesem Rechner und in einem Raum, den wenige kennen, ist es machbar. Als Besprechungssystem für ein ganzes Haus, als Beleg mit Rechtskraft oder als Netz für sehr viele Menschen ist es auf dieser Technik nicht machbar.

## Urteil

| Frage | Urteil | Warum |
|---|---|---|
| Schreibtisch, Auftrag, Akte, Text | Tragfähig | Liegt im Browser. Die Akte liest gespeicherte Räume. Text kopiert nur diesen Text. |
| Zeile und Entscheidung bleiben beim Namen | Tragfähig als Mischregel, nicht als Recht | Ein anderer Name und Gast ersetzen den Eintrag nicht. Der Name kommt vom Client. Wer „Ada“ schickt, gilt als Ada. |
| Vier offene Sitzungen, eine Kamera | Tragfähig | Die Liste liegt lokal (`arc-sessions-v1`). Die Kamera hat einen Halter. Ein zweites Mikrofon neben einem laufenden Gespräch wird nicht geöffnet. |
| Gespräch bis sechs Personen | Tragfähig in offenen Netzen | Vollvermaschung, nur STUN. Hinter zwei strengen Netzen kann es scheitern. Es gibt keinen TURN. |
| Acht Personen am gemeinsamen Tisch | Tragfähig | `/api/share`, Abfrage alle 2 Sekunden, Fassung als ein JSON, höchstens 100 KB. |
| Prüfung aller Kameras | Tragfähig für das, was der Browser meldet | Höchstens acht Geräte. Gemessen mit einem Scheingerät. Ein echtes Gerät hängt am Browser und an der Erlaubnis. |
| Arcy liest und sieht | Tragfähig, wenn der Schlüssel da ist | grok-4.5, höchstens zwölf Aufrufe je Minute für den ganzen Prozess. Ohne `XAI_API_KEY` kommt keine Antwort. Das Bild wird nicht gespeichert. |
| Viele gleichzeitige Räume, Monate Archiv | Nicht auf diesem Bau | Ab 2000 Räumen löscht `arc_memory` und `arc_agenda` die ältesten 200. Das ist ein Arbeitsspeicher, kein Archiv. |
| Nur die echte Person darf ihre Entscheidung ändern | Nicht auf diesem Bau | Dafür braucht es ein Konto, das an den Namen gebunden ist. `VITE_AUTH_ENABLED` ist aus. Der Anbieter in der Wurzel reicht die Kinder nur durch. |
| Mehr als sechs mit Ton und Bild | Nicht auf diesem Bau | Sechs Personen sind fünfzehn direkte Verbindungen. Mehr braucht einen Medien-Server, kein größeres Netz aus Browsern. |
| Zahlung, CRM, Rechtsbeleg, VR | Nicht gebaut und hier nicht tragfähig | Steht nicht im Produkt. Der Bau liefert dafür keine Grundlage. |

## Was gemessen ist

- Die Mischregel für Entscheidungen: Tests, und ein echter Schreib- und Lesevorgang über `/api/memory`. Ada bleibt Ada. Ben früher, Ben später und Gast ändern den Eintrag nicht. Ada selbst kann den Titel später korrigieren.
- Der Bau der App und der erste Bildschirm: bauen ohne Fehler, kein Fehler in der Konsole. Die erste Führung liegt über dem Schreibtisch.
- Die Prüfung: ein Scheingerät, ein Aufruf der Kamera, danach wieder losgelassen. Drei Geräte sind in der Simulation durchgelaufen, nicht an echter Hardware.

Nicht gemessen: sechs echte Personen gleichzeitig, zwei Netze mit strengem NAT, ein Monat Last auf Postgres, jede Kamera eines echten Laptops.

## Der Weg der Daten

| Weg | Wohin | Grenze |
|---|---|---|
| Auftrag, Blatt, Datei, Sitzungsliste, Gespräch der Tageszone | Dieser Browser | Datei höchstens 8 MB, 16 Stück. Mitnehmen höchstens 8 MB. |
| Akte eines Raums | `arc_memory`, ein JSON je Raum | Anfrage höchstens 100 KB. Leer überschreibt nicht. |
| Gemeinsamer Tisch | `arc_share` | Acht Personen. Wer 20 Sekunden schweigt, fällt aus der Liste. |
| Ton und Bild | Direkt von Browser zu Browser, nachdem `/api/rtc` Angebot und Antwort kurz gehalten hat | Signale höchstens 32 KB. Personen verschwinden nach 30 Sekunden ohne Lebenszeichen. Signale nach 60 Sekunden. |
| Blick an Arcy | Ein JPEG an grok-4.5, höchstens 180 KB | Nicht in den Raum, nicht in die Akte. |
| Vorschau ohne `DATABASE_URL` | PGLite, Postgres im Browser-Prozess | Ein Prozess. Für die Vorschau, nicht für viele gleichzeitige Server. |
| Betrieb mit `DATABASE_URL` | Postgres (Neon) | Dieselbe Abfragesprache. Der Code muss dafür nicht umgeschrieben werden. |

Die Tabellen entstehen beim ersten Zugriff (`CREATE TABLE IF NOT EXISTS`), nicht nur über die Migrationsdatei der Konten. Konten sind eine eigene, ungenutzte Migration.

## Das Gespräch

Jedes Paar baut eine eigene `RTCPeerConnection`. Die Kennung, die alphabetisch größer ist, macht das Angebot. Der Server sieht die Stimme nicht.

Das ist für zwei bis sechs Personen machbar:

- Sechs Personen: fünfzehn Verbindungen. Jede schickt Ton und, wenn an, Bild.
- Die siebte Person wird abgewiesen. Die Kappe sitzt im Client (`ROOM_CAP = 6`), die Liste auf dem Server kann bis 32 Zeilen halten.
- STUN fragt nur die öffentliche Adresse. Liegt kein offener Weg, bleibt die Verbindung aus. Ein Relay ist nicht eingebaut. Ein TURN-Server ließe sich als Adresse dazusetzen, er ist aber ein eigener Dienst mit Kosten und immer noch kein Versprechen, dass jedes Firmennetz durchlässt.
- Die Abfrage läuft zuerst alle 450 ms, danach alle 2 Sekunden, über die Datenbank. Das trägt wenige Räume. Hunderte gleichzeitige Gespräche würden die Datenbank mit Lebenszeichen füllen. Dafür bräuchte es eine andere Vermittlung, nicht schnellere Abfragen.

Bildschirm teilen, Chat und Untertitel laufen über denselben Datenkanal, nachdem die Verbindung steht. Untertitel nutzen die Spracherkennung des Browsers. Die ist nicht auf jedem Gerät gleich.

## Die Akte

`mergeMemory` mischt die ankommende Fassung in die gespeicherte. Eine spätere leere Fassung löscht nichts. Eine Zeile mit anderem echtem Namen bleibt. Eine Entscheidung mit anderem Namen oder ohne echten Namen bleibt.

Das ist technisch stabil für gleichzeitiges Schreiben in kleinem Maß: die letzte geschriebene Mischung gewinnt, und die Regel läuft bei jedem Schreiben neu. Zwei Schreibvorgänge ganz gleichzeitig können sich trotzdem überholen, weil es keine Transaktion mit Zeilensperre gibt. Bei zwei Personen in einem Raum ist das selten und die Regel fängt den fremden Namen. Bei vielen gleichzeitigen Schreibern auf denselben Raum ist es eine Lücke.

Die Akte über mehrere Räume wird im Browser zusammengesetzt, höchstens fünf Räume. Dieselbe Entscheidung wird nach der Zeit sortiert und dann mit derselben Besitzregel gemischt. Der Server kennt den Auftrag nicht. Fällt der Browser aus, bleibt der Raum auf dem Server, die Liste der offenen Sitzungen nicht.

Der Name ist kein Nachweis. `by` und `name` sind Text, den der Client schickt und den `fitMemory` nur säubert. Die Regel verhindert, dass „Ben“ eine Entscheidung von „Ada“ überschreibt. Sie verhindert nicht, dass jemand von Anfang an „Ada“ schreibt.

Zeitstempel werden auf ein Jahr zurück und eine Minute voraus begrenzt. Ein gefälschter sehr alter Stempel wird angehoben. Innerhalb dieses Jahres bleibt ein älterer Stempel alt und gewinnt nicht gegen den vorhandenen Eintrag.

## Kamera

Ein Halter. Tageszone, Stimme, Gedanke, Hub, Raum und Prüfung teilen sich das Gerät. Ist der Halter die Stimme oder der Raum, fasst die Prüfung ihn nicht an. War die Vorschau an, geht sie für die Prüfung aus und bleibt aus.

Die Prüfung zählt die Geräte, die `enumerateDevices` nach einer Erlaubnis nennt, öffnet jedes kurz, liest Spur und ein Bild, stoppt die Spur. Blockiert der Browser, steht der Grund da, und der Rest wird nicht weiter geöffnet. Das ist machbar. Es ist keine Garantie für jede eingebaute Kamera: mancher Browser nennt das Gerät erst nach der Erlaubnis, mancher hält die Kamera fest, obwohl die Spur beendet ist.

## Arcy

Kennen rechnet lokal. Kein Netz, keine Erfindung: letzte Zeile, sonst Entscheidung, sonst aktueller Punkt, sonst „Gespeichert: nichts.“

Frag die Akte, Schau und die Frage im Feld gehen an den Server. Der Kontext ist auf 8000 Zeichen begrenzt, die Frage auf 2000, das Bild auf 180 KB. Zwölf Aufrufe je Minute gelten für den Prozess, nicht je Person. Ein ausgelasteter Server verweigert den dreizehnten, auch wenn er von jemand anderem kommt.

Ohne Schlüssel ist die ehrliche Meldung die richtige Antwort. Ein zweites Modell oder eine Warteschlange ist nicht da.

## Was ein bezahlter Raum bräuchte

Nicht mehr Fenster. Drei technische Schritte, in dieser Reihenfolge. Jeder ist auf diesem Bau machbar. Keiner ist gebaut.

1. **Ein Name, der hält.** Konto an, und der Server schreibt den Namen aus der Sitzung, nicht aus dem JSON. Dann kann „Ben“ nicht als „Ada“ korrigieren. Der vorhandene Auth-Code ist die Tür, er ist nicht an `arc_memory` gebunden.
2. **Ein Raum mit Besitzer.** Schreiben nur für die Personen, die der Besitzer eingetragen hat. Der Code allein reicht dann nicht. Die Mischregel bleibt, sie wird zur zweiten Linie, nicht zur einzigen.
3. **Ein Archiv statt eines Deckels.** Die 2000-Räume-Löschung darf für bezahlte Räume nicht laufen. Dafür eine eigene Tabelle oder ein Merkmal, kein stilles Löschen.

TURN und ein Medien-Server sind eigene Produkte. Sie sind nicht nötig, damit eine Runde von vier Personen in einem offenen Netz die Akte behält.

## Was dieser Bau nicht werden kann

- Ein Gespräch mit zwanzig Bildern. Die Vermaschung wächst quadratisch. Der Browser trägt das nicht.
- Ein Beleg vor Gericht. Kein signierter Name, keine lückenlose Kette, Stempel können innerhalb eines Jahres gesetzt werden.
- Ein Anschluss an Jira, Trello oder ein CRM. Es gibt keine solche Schnittstelle, und Text ist absichtlich nur eine Kopie.
- Ein Betrieb auf PGLite für viele Besucher. Ein Prozess, eine Datei.
- Eine Milliarde Nutzer, ein Wissensgraph oder ein Zahlungssystem. Dafür fehlt nicht ein Knopf, sondern die Grundlage.

## Folge für den nächsten Schritt

Der nächste technisch sinnvolle Schritt ist nicht mehr Kamera und nicht mehr Sitzungen. Es ist die Bindung des Namens an eine Sitzung, und erst dann ein Raum, den nicht jeder mit dem Code überschreibt. Bis dahin bleibt die Mischregel ehrlich: sie schützt den gespeicherten Namen vor einem anderen Namen. Sie beweist nicht, wer an der Tastatur saß.
