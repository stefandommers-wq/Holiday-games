// Service worker: alles precachen, cache-first serveren.
// Bij elke wijziging aan de bestandenlijst CACHE_VERSION ophogen, anders blijft
// een toestel op de oude versie hangen.

const CACHE_VERSION = 'arcade-v4';

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './shared/catalog.js',
  './shared/storage.js',
  './shared/loop.js',
  './shared/surface.js',
  './shared/input.js',
  './shared/audio.js',
  './shared/ui.js',
  './shared/chooser.js',
  './shared/physics.js',
  './games/placeholder.js',
  './games/snake.js',
  './games/pong.js',
  './games/breakout.js',
  './games/blokken.js',
  './games/invasie.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Eén voor één, zodat één ontbrekend bestand niet de hele installatie sloopt.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] niet gecachet:', url, err);
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // Offline en niet in de cache: voor een paginanavigatie de schil teruggeven.
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
