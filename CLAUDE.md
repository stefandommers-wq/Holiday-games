Arcade
Offline arcade-app voor de iPhone. Vijf klassieke spelletjes in één webapp die vanaf het beginscherm start en volledig zonder internet werkt.
Harde regels
Geen frameworks, geen build-stap, geen npm dependencies. Alleen HTML, CSS en vanilla JavaScript in ES modules.
Geen enkele externe URL. Geen CDN, geen Google Fonts, geen analytics, geen externe afbeeldingen. Alles staat in de repo.
Alles moet werken in vliegtuigstand nadat de app één keer is geladen. Dit is de acceptatietest voor elke wijziging, niet een wens achteraf.
Touch-first. Geen enkele functie mag een toetsenbord of muis nodig hebben. Toetsenbordbediening mag als extra voor desktop, maar nooit als enige manier.
Werkt staand op alles van iPhone SE tot Pro Max. Landschap is optioneel.
Techniek
index.html is de schil met het menu. Elk spel is een ES module in /games die start(canvas) en stop() exporteert. De schil weet verder niets van de inhoud van een spel.
Gedeelde code staat in /shared. Daarin de gameloop met requestAnimationFrame en een vaste tijdstap, de invoerafhandeling, scoreopslag en geluid.
Rendering op één <canvas> per spel, geschaald op devicePixelRatio zodat het scherp is op retina.
Scores in localStorage onder de sleutel arcade.highscore.<spel>. Instellingen in één JSON-object onder arcade.settings.
De service worker precachet alle bestanden en serveert cache-first. Bij elke release CACHE_VERSION ophogen, anders blijven gebruikers op de oude versie hangen. Controleer na elke wijziging of nieuwe bestanden ook echt in de precache-lijst staan.
Voortgang en hervatten
Elk spel exporteert naast start(canvas) en stop() ook serialize() en restore(state). Een spel dat halverwege wordt afgebroken moet later exact zo terugkomen.
De schil slaat de toestand automatisch op bij visibilitychange en pagehide. Op iOS krijg je geen betrouwbaar afsluitmoment, dus daar kun je niet op wachten.
Staat er bij het openen van een spel een bewaarde toestand klaar, dan vraagt de schil eerst of je verder wilt of opnieuw wilt beginnen. Na game over wordt die toestand gewist.
Drie aparte sleutels. arcade.state.<spel> voor een lopend potje, arcade.progress.<spel> voor het hoogst bereikte level, en arcade.highscore.<spel> voor de score.
Een spel zonder levels slaat alleen de highscore en een lopend potje op. Verzin geen progressie waar die niet hoort.
iOS valkuilen die vanaf het begin opgelost moeten zijn
Viewport met viewport-fit=cover en safe-area-inset voor de dynamic island en de home indicator.
100dvh in plaats van 100vh, anders klopt de hoogte niet als de Safari-balk verschijnt.
touch-action: none op het speelveld, user-select: none overal, en dubbeltik-zoom uitzetten.
overscroll-behavior: none tegen pull-to-refresh tijdens het spelen.
Geluid via Web Audio, en de AudioContext pas aanmaken na de eerste tik van de gebruiker. Eerder start iOS het niet.
Geen navigator.vibrate, dat werkt niet in Safari.
In de head apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-style en apple-touch-icon. In manifest.json staat display: standalone.
Stijl
Donker retro-arcade thema met één kleurpalet voor alle spelletjes. Eén lettertype, lokaal meegeleverd of een systeemfont.
Raakvlakken minimaal 44 bij 44 punten.
Elk spel heeft dezelfde opbouw. Titel, highscore, grote speelknop, en een terugknop die altijd op dezelfde plek staat.
Menu en spel voelen als één product, niet als vijf losse projecten onder één dak.
Werkwijze
Eén spel of één afgeronde functie per pull request. Niet meerdere spelletjes tegelijk.
Geen refactor van bestaande spelletjes tenzij ik daar expliciet om vraag.
Bij elke pull request kort opschrijven wat er getest moet worden op het toestel.