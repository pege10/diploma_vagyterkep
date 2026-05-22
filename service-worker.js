/* ==========================================================
   Service Worker – Holistic Search Engine
   HTML/JS/CSS: network-first (friss app.js), egyéb statikus: cache-first.
   Supabase / térkép csempék: mindig hálózat.
   ========================================================== */

const CACHE_NAME = 'darts-cache-v167';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/exhibition/',
  '/exhibition/index.html',
  '/exhibition/manifest.json',
  '/exhibition.html',
  '/style.css?v=196',
  '/app.js?v=273',
  '/icons/favicon.svg',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
  '/img/welcome-result-map.png',
  '/data/magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett.bundle.js?v=2',
  '/sorszam.html',
];

function isNetworkFirstAsset(url) {
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return true;
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) return true;
  return false;
}

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('openfreemap.org') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }

  if (isNetworkFirstAsset(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
