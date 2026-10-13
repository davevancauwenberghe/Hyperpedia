// The installed app keeps a small, public fallback shell, never visited pages.
const version = new URL(self.location.href).searchParams.get('v') || 'current';
const cacheName = `hyperpedia-shell-${version}`;
const assets = [
  '/offline.html',
  '/offline.js',
  '/style.css',
  '/favicon.svg',
  '/storage.js',
  '/theme.js',
];
const privatePath = (path) =>
  /^\/(?:admin(?:\/|$)|login(?:\/|$)|logout(?:\/|$))/.test(path);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await cache.addAll(
        assets.map(
          (path) =>
            new Request(new URL(path, self.location.origin), {
              cache: 'reload',
              credentials: 'omit',
            }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter(
            (key) => key.startsWith('hyperpedia-shell-') && key !== cacheName,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    privatePath(url.pathname)
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const fallback = await (
            await caches.open(cacheName)
          ).match('/offline.html');
          if (!fallback) return Response.error();
          return new Response(await fallback.arrayBuffer(), {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Robots-Tag': 'noindex, nofollow',
            },
          });
        }
      })(),
    );
  } else if (assets.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName);
        try {
          const response = await fetch(
            new Request(request, { credentials: 'omit' }),
          );
          if (
            response.ok &&
            !/private|no-store/i.test(
              response.headers.get('Cache-Control') || '',
            )
          ) {
            try {
              await cache.put(url.pathname, response.clone());
            } catch {}
          }
          return response;
        } catch {
          return (await cache.match(url.pathname)) || Response.error();
        }
      })(),
    );
  }
});
