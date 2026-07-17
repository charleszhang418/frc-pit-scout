/* Pit Scout service worker — network-first app shell + offline fallback.
 * Bump CACHE_NAME when changing this file so activate clears stale caches.
 */
const CACHE_NAME = 'pit-scout-v42';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './styles.css?v=42',
  './app.js',
  './app.js?v=42',
  './config.js',
  './config.js?v=42',
  './sync-client.js',
  './sync-client.js?v=42',
  './teams.csv',
  './manifest.json',
  './prescouting.json',
  './pit-map.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', cache: CACHE_NAME });
      }
    })()
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppShell(url) {
  const path = url.pathname;
  return (
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('/manifest.json') ||
    path.endsWith('manifest.json')
  );
}

function isEventData(url) {
  const path = url.pathname;
  return (
    path.endsWith('prescouting.json') ||
    path.endsWith('pit-scout-baseline.json') ||
    path.endsWith('pit-map.json') ||
    path.endsWith('teams.csv')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isSameOrigin(url)) return;

  // Always network-first for navigations, app shell, and event data so deploys show up
  // without requiring a hard refresh. Cache is offline fallback only.
  if (event.request.mode === 'navigate' || isAppShell(url) || isEventData(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
