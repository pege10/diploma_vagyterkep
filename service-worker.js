/* ==========================================================
   Service Worker – Holistic Search Engine
   Stratégia: Cache-first statikus eszközökre, network-first
   dinamikus Supabase API hívásokra.
   ========================================================== */

const CACHE_NAME = 'darts-cache-v15';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css?v=15',
  '/app.js?v=15',
  '/manifest.json',
];

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

  // Supabase API és tiles hálózati hívások: mindig hálózat
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('openfreemap.org') ||
    url.hostname.includes('unpkg.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Statikus eszközök: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
