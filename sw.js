// Кэшируем ТОЛЬКО оболочку. Заявки — персональные данные,
// на диск устройства они не попадают (152-ФЗ).
const CACHE = 'bookings-shell-v6';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/ui.js',
  'js/api.js',
  'js/auth.js',
  'js/store.js',
  'js/status.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Запросы к API мимо кэша всегда: ответы содержат персональные данные.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
