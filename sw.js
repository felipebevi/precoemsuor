/* Service worker mínimo: cache dos assets estáticos + lib de OCR (uso offline).
   Mantido simples de propósito — não é crítico para o MVP. */
const CACHE = 'preco-em-suor-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // cacheia também os assets do Tesseract servidos pelo jsDelivr (OCR offline)
  const cacheable = ASSETS.some(a => url.endsWith(a.replace('./', '/'))) || url.includes('cdn.jsdelivr.net/npm/tesseract');
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (cacheable && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
    })
  );
});
