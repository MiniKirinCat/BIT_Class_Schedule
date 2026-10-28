const CACHE_NAME = 'next-class-shell-v2';
const SCOPE = self.registration.scope;
const SHELL_URL = new URL('./index.html', SCOPE).href;
const ROOT_URL = new URL('./', SCOPE).href;
const EXTRA_URLS = [
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
].map((path) => new URL(path, SCOPE).href);

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  let response;
  try {
    response = await fetch(new Request(SHELL_URL, { cache: 'reload' }));
  } catch {
    return;
  }
  if (!response.ok) return;

  await cache.put(SHELL_URL, response.clone());
  await cache.put(ROOT_URL, response.clone());

  const html = await response.text();
  const urls = new Set(EXTRA_URLS);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (!value || value.startsWith('data:') || value.startsWith('#')) continue;
    const url = new URL(value, SHELL_URL);
    if (url.origin === self.location.origin) urls.add(url.href);
  }

  await Promise.allSettled(
    [...urls].map(async (url) => {
      if (url === SHELL_URL || url === ROOT_URL) return;
      try {
        const asset = await fetch(new Request(url, { cache: 'reload' }));
        if (asset.ok) await cache.put(url, asset);
      } catch {
        // A missing optional icon must not fail the whole shell install.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith('next-class-shell-') && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await cache.put(SHELL_URL, response.clone());
      await cache.put(ROOT_URL, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(SHELL_URL)) ||
      (await cache.match(ROOT_URL));
    if (cached) return cached;
    return new Response('离线状态下应用壳尚未缓存，请联网后再打开一次。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(new URL('./api/', SCOPE).pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
