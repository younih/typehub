/* TypeHub Service Worker — آفلاین (فقط فایل‌های استاتیک؛ هرگز /api/ کش نمی‌شود) */
const CACHE = 'typehub-v5';
const FILES = [
  './', './index.html', './app.html', './admin.html',
  './css/style.css?v=5',
  './js/content.js?v=5', './js/engine.js?v=5', './js/app.js?v=5', './js/auth.js?v=5',
  './manifest.json', './icons/icon.svg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  var url = new URL(e.request.url);
  // درخواست‌های بک‌اند همیشه مستقیم به شبکه می‌روند (وضعیت ورود نباید کش شود)
  if (url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // فقط پاسخ‌های موفق GET کش می‌شوند
      if (e.request.method === 'GET' && res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
