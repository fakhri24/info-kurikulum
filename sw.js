/* Service worker minimal.
   Kerangka halaman disimpan agar tetap terbuka saat sinyal buruk.
   Data (data/*.json) selalu diambil dari jaringan lebih dulu supaya
   perubahan di Google Sheet tidak tertahan cache. */

var CACHE = 'info-kurikulum-v2';

var KERANGKA = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/icons/icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(KERANGKA); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (nama) {
        return Promise.all(nama.map(function (n) {
          return n === CACHE ? null : caches.delete(n);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var permintaan = e.request;
  if (permintaan.method !== 'GET') return;

  var url = new URL(permintaan.url);
  if (url.origin !== self.location.origin) return; // font & tautan luar lewat apa adanya

  if (url.pathname.indexOf('/data/') !== -1) {
    // Jaringan dulu; cache hanya dipakai saat jaringan gagal.
    e.respondWith(
      fetch(permintaan)
        .then(function (r) {
          var salinan = r.clone();
          caches.open(CACHE).then(function (c) { c.put(permintaan, salinan); });
          return r;
        })
        .catch(function () { return caches.match(permintaan); })
    );
    return;
  }

  // Kerangka: cache dulu agar tampil instan, lalu disegarkan di latar belakang.
  e.respondWith(
    caches.match(permintaan).then(function (tersimpan) {
      var dariJaringan = fetch(permintaan)
        .then(function (r) {
          var salinan = r.clone();
          caches.open(CACHE).then(function (c) { c.put(permintaan, salinan); });
          return r;
        })
        .catch(function () { return tersimpan; });
      return tersimpan || dariJaringan;
    })
  );
});
