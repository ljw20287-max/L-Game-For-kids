importScripts('./pwa-assets.js');

const CACHE_PREFIX = 'how-things-work-pwa';
const CACHE_VERSION = self.PWA_CACHE_VERSION || 'dev';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const SCOPE_URL = new URL(self.registration.scope);
const PRECACHE_URLS = (self.PWA_ASSETS || []).map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      PRECACHE_URLS.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;

  if (request.headers.has('range')) {
    event.respondWith(handleRangeRequest(request));
    return;
  }

  const accept = request.headers.get('accept') || '';
  const wantsDocument = request.mode === 'navigate' || request.destination === 'document' || accept.includes('text/html');
  if (wantsDocument) {
    event.respondWith(handleDocumentRequest(request));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('index.html', self.registration.scope).href);
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});

async function handleDocumentRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const fallback = await cache.match(new URL('index.html', self.registration.scope).href);
    if (fallback) return fallback;

    throw error;
  }
}

async function handleRangeRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match(request, { ignoreSearch: true });

  if (!response) {
    response = await fetch(request);
    if (!response || response.status !== 200) return response;
    cache.put(request, response.clone());
  }

  const range = request.headers.get('range') || '';
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return response;

  const blob = await response.blob();
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : blob.size - 1;

  if (start >= blob.size || end < start) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: {
        'Content-Range': `bytes */${blob.size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }

  const boundedEnd = Math.min(end, blob.size - 1);
  const body = blob.slice(start, boundedEnd + 1);
  const headers = new Headers(response.headers);
  headers.set('Content-Length', String(body.size));
  headers.set('Content-Range', `bytes ${start}-${boundedEnd}/${blob.size}`);
  headers.set('Accept-Ranges', 'bytes');

  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}
