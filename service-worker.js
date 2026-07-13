/*
 * service-worker.js
 * ----------------------------------------------------------------------------
 * Offline support via a cache-first strategy over a small, fixed app shell.
 * There is no remote data to sync (everything lives in localStorage), so the
 * worker only needs to make the static files available without a network.
 *
 * All paths are RELATIVE. The worker's own location sets the base, so the same
 * files work whether the app is served from a domain root or from a GitHub
 * Pages project subpath such as /hours-tracker/.
 *
 * Bump CACHE_NAME on any asset change so old caches are replaced on activate.
 */

const CACHE_NAME = 'hours-tracker-v1';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './store.js',
  './calc.js',
  './csv.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Pre-cache the shell and activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

// Remove superseded caches and take control of open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Serve from cache first, falling back to the network. For navigations that
// miss the cache while offline, fall back to the cached app shell.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return Response.error();
      });
    }),
  );
});
