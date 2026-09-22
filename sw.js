// Кэшируем ТОЛЬКО оболочку. Заявки — персональные данные,
// на диск устройства они не попадают (152-ФЗ).
//
// Стратегия — «сначала сеть». Кэш нужен лишь для работы без связи.
// Обратный порядок (сначала кэш) приводил к тому, что на устройстве
// неделями жила старая версия страницы.
const CACHE = 'bookings-shell-v13';
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
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Свежий файл кладём в кэш — пригодится, когда связи не будет.
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
