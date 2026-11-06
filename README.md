# Infinity-Meet-Zone

Schreibtisch für Sitzung, Kamera und Akte. Der Raum merkt sich, was gesagt und entschieden wurde.

## Start

Node 22.

```bash
npm install
npm run dev
```

Die App liegt dann unter http://localhost:8080.

Ohne `DATABASE_URL` bleibt die Raumakte in einer lokalen Datenbank in diesem Ordner. Für eine gemeinsame Akte über mehrere Rechner setzt du `DATABASE_URL` auf eine Postgres-Adresse.
