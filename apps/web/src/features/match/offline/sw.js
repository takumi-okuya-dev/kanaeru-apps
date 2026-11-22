// 試合表の Service Worker の本文（範囲は /match/。組み立てが match/sw.js に書き出す。apps/web/scoped-service-worker.ts）。
// 今は自分を外すだけの形（core-015。画面はまだ入れない）。ネットなしで開く本文は match-005 で書く。
// 組み立てが下の2つの印を埋める（持つ道の並びと版の印）。この形では使わない。
const PRECACHE = self.__SW_PRECACHE__;
const VERSION = self.__SW_VERSION__;
void PRECACHE;
void VERSION;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("kanaeru-match-")).map((key) => caches.delete(key)),
      );
      await self.registration.unregister();
    })(),
  );
});
