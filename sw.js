// Service worker — network-first สำหรับไฟล์แอป (ออนไลน์ได้ของใหม่เสมอ),
// ใช้แคชเป็น fallback ตอนออฟไลน์
const CACHE = "baanrao-v30";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/home.js",
  "./js/shopping.js",
  "./js/staples.js",
  "./js/menu.js",
  "./js/pets.js",
  "./js/finance.js",
  "./js/compare.js",
  "./js/account.js",
  "./js/settings.js",
  "./js/ui.js",
  "./js/supabase.js",
  "./js/config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // ปล่อย Supabase (POST/PATCH ฯลฯ) วิ่งตรง

  const url = new URL(req.url);

  // โมดูล CDN (esm.sh) → cache-first เพราะ pin เวอร์ชันไว้แล้ว
  if (url.host.endsWith("esm.sh")) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
      )
    );
    return;
  }

  // ไฟล์ในโดเมนเรา + การนำทาง → network-first, ล้มเหลว (ออฟไลน์) ค่อยใช้แคช
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }
  // ที่เหลือ (Supabase realtime ฯลฯ) ปล่อยผ่าน
});
