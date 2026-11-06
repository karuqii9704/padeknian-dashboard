// Service worker Padeknian: "offline shell" saja.
//  - Halaman (navigasi): selalu dari jaringan; bila offline tampilkan /offline.html.
//  - Aset statis Next (/_next/static, berkas versi-hash) dan ikon: cache-first.
//  - API dan halaman berisi data pegawai TIDAK disimpan (perangkat bisa dipakai bergantian).
const VERSI = "padeknian-v1";
const OFFLINE = "/offline.html";
const PRA_CACHE = [OFFLINE, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSI).then((c) => c.addAll(PRA_CACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const salinan = res.clone();
              caches.open(VERSI).then((c) => c.put(req, salinan));
            }
            return res;
          }),
      ),
    );
  }
});
