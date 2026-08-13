# Arcade

Vijf klassieke spelletjes in één webapp: Snake, Pong, Breakout, Blokken en Ruimte-invasie.
Draait vanaf het beginscherm van je telefoon, werkt volledig offline en is met een link te delen.

Geen frameworks, geen build-stap, geen npm-pakketten. Alleen HTML, CSS en vanilla JavaScript.

## Zelf draaien

Een gewone statische server is genoeg (een service worker werkt niet vanaf `file://`):

```sh
python3 -m http.server 8099
# open daarna http://localhost:8099
```

## Op je telefoon zetten

1. Open de gepubliceerde link in Safari (iPhone) of Chrome (Android).
2. Tik op de deelknop en kies **Zet op beginscherm**.
3. Start de app vanaf het beginscherm. Vanaf dat moment werkt hij ook in vliegtuigstand.

## Structuur

```
index.html        de schil met menu, spelscherm en instellingen
app.js            router, opslag van een lopend potje, pauze, game over
styles.css        één donker thema voor alles
shared/           gameloop, canvas, invoer, geluid, opslag, dialogen
games/            één ES-module per spel
sw.js             service worker: precache + cache-first
tools/            ontwikkelscripts (iconen maken, precache controleren)
```

Elk spel exporteert `start(canvas, api)`, `stop()`, `serialize()` en `restore(state)`.
De schil bewaart een onderbroken potje en vraagt bij het openen of je verder wilt.

## Voor het publiceren

```sh
node tools/check-precache.mjs   # staat elk bestand in de service worker?
```

Bij elke release `CACHE_VERSION` in `sw.js` ophogen, anders blijven toestellen op de oude versie hangen.
