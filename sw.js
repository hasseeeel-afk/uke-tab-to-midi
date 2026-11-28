// 更新時は VERSION と index.html の ?v= を同じ値に上げる
const VERSION = '13';
const CACHE = 'tab-calc-v' + VERSION;
const ASSETS = [
  './',
  'index.html',
  `style.css?v=${VERSION}`,
  `app.js?v=${VERSION}`,
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' で HTTP キャッシュを通さず必ずサーバーから取得（新旧ファイルの混在を防ぐ）
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first: オンラインなら常に最新、オフライン時のみキャッシュ
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      return (await cache.match(req)) ||
        (req.mode === 'navigate' ? await cache.match('index.html') : undefined) ||
        Response.error();
    }
  })());
});
