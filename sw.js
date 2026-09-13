// Service worker: makes the app usable with no network connection.
// App shell and CDN libraries are cached. Live data (Firestore, Auth,
// exchange rates) is never cached here - Firestore keeps its own offline
// cache, and rate lookups are stored in Firestore by the app itself.

const CACHE = 'honeymoon-expenses-v1';

const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Hosts whose responses are safe to cache forever (versioned library files).
const CACHEABLE_HOSTS = [
  'unpkg.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Hosts that must always go to the network.
const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api.frankfurter.app',
  'api.frankfurter.dev'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (NETWORK_ONLY_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  const sameOrigin = url.origin === self.location.origin;
  const cacheableCdn = CACHEABLE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

  if (!sameOrigin && !cacheableCdn) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);

      // Cache first for libraries, network-with-fallback for the app shell so
      // a redeploy is picked up as soon as there is a connection.
      if (cacheableCdn && cached) return cached;
      return cached ? network.then((r) => r || cached).catch(() => cached) : network;
    })
  );
});
