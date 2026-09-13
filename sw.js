// Service worker: makes the app usable with no network connection.
//
// Our own files are always fetched from the network first, bypassing the
// browser HTTP cache, so a redeploy shows up on the next launch. The cached
// copy is only used when the network is unavailable. Versioned CDN libraries
// are cached permanently since their URLs never change content.

const CACHE = 'honeymoon-expenses-v2';

const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const CACHEABLE_HOSTS = [
  'unpkg.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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

  // Our own files: always ask the network, ignoring any stale HTTP-cached copy.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(url.href, { cache: 'reload' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Versioned library files: serve from cache once we have them.
  const cacheable = CACHEABLE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
