// NM NEXUS Service Worker
// Caches app shell only — NEVER caches private message content or keys.
const CACHE = 'nm-nexus-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache API or Supabase requests
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    return;
  }
  // Cache-first for static assets
  if (e.request.method === 'GET' && ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // Network-first for everything else
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});
