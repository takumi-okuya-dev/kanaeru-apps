// 試合表の Service Worker の本文（範囲は /match/。組み立てが match/sw.js に書き出す。apps/web/scoped-service-worker.ts。AD-27）。
// - 持つのは試合表の画面のファイルだけ（組み立てが埋める PRECACHE：index.html・入口の束・試合表の画面の束と CSS）。
//   API の答え（/api/…）は持たない・触らない（データは画面が IndexedDB に置く。AD-28）
// - /match/ の下の画面を開く要求（navigate）は、持っている index.html をすぐ返す（電波が弱くても待たない）。持っていなければ取りに行く
// - 持っているファイルの要求は持っているものを返す。ほかの要求は触らない（ブラウザがそのまま取りに行く）
// - 新しい版（組み立て直した画面）は、ブラウザが match/sw.js の変わり目に気づいて入れ、待たせる。画面が「新しい版があります」を
//   出し、運営が「読み直す」を押すと SKIP_WAITING を受けて入れ替わる（AD-27【仮決め】）。入れ替わったら古い版のファイルを消す
// - 止め方：①機能の印 match.offline を切にする（画面と、この本文が10分おきに確かめ、切なら自分を外してファイルを消す）
//   ②壊れたときは SELF_UNREGISTER を true にして出す（入った途端に自分を外し、ファイルを消し、開いている画面を読み直す）。
//     同時に①も切にする（入のままだと、画面が開くたびに入れ直しては外すをくり返す）
// - 外枠は、つながっているときに裏で取り直す（守りの見出し〈CSP・Permissions-Policy〉を新しくするため）。取り直した外枠が
//   この版の持つ束だけを指すときだけ差しかえる（画面を組み直したあとの外枠は、新しい版の Service Worker が入れる）
// import を書かない（ふつうの script として動かす）。
"use strict";

/** 壊れたときだけ true にして出す（自分を外すだけの Service Worker になる。AD-27 の止め方）。 */
const SELF_UNREGISTER = false;

/** 持つファイルの道（組み立てが埋める）。 */
const PRECACHE = self.__SW_PRECACHE__;
/** 版の印（組み立てが埋める）。 */
const VERSION = self.__SW_VERSION__;

/** 置き場所の名前の頭（ほかのアプリの置き場所に触らない）。 */
const CACHE_PREFIX = "kanaeru-match-";
/** この版の置き場所。 */
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
/**
 * 画面の外枠（どの道でも同じ index.html）を置く鍵と、取りに行く道。/match/ の下の道で取る（守りの見出し〈試合表の道だけ
 * カメラを許す Permissions-Policy・CSP〉ごと持ち、開くときにそのまま返すため。/index.html だとカメラを止める見出しになる）。
 */
const SHELL = "/match/";
/** 範囲（この道の下の画面だけ受け持つ）。 */
const SCOPE_PATH = "/match/";
/** 機能の印を確かめる窓口（ログインなし）。 */
const OFFLINE_SETTING = "/api/v1/match/offline";
/** 機能の印を確かめる間（ミリ秒）。 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** 持つファイルの道の集まり。 */
const PRECACHED = new Set(PRECACHE);
/** 最後に機能の印を確かめた時刻。 */
let lastCheck = 0;
/** 外枠を最後に取り直した時刻。 */
let lastShellRefresh = 0;
/** 外枠を取り直す間（ミリ秒）。 */
const SHELL_REFRESH_MS = 60 * 1000;

/**
 * つながっていれば外枠を取り直し、この版の持つ束だけを指すなら差しかえる（届かなければ何もしない）。
 * @returns 終わり
 */
async function refreshShell() {
  const now = Date.now();
  if (now - lastShellRefresh < SHELL_REFRESH_MS) return;
  lastShellRefresh = now;
  try {
    const response = await fetch(SHELL, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map(
      (match) => match[1],
    );
    if (assets.length === 0 || !assets.every((path) => PRECACHED.has(path))) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(SHELL, response);
  } catch {
    // 電波がない・届かないときは、持っている外枠のまま
  }
}

/**
 * 自分を外し、置き場所を消し、開いている試合表の画面を読み直す（止めるとき）。
 * @returns 終わり
 */
async function removeSelf() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
  );
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: "window" });
  await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
}

/**
 * 機能の印を確かめ、切（か、アプリが見えない 404）なら自分を外す。届かないときは何もしない。
 * @returns 終わり
 */
async function checkSetting() {
  const now = Date.now();
  if (now - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = now;
  try {
    const response = await fetch(OFFLINE_SETTING, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 404) {
      await removeSelf();
      return;
    }
    if (!response.ok) return;
    const body = await response.json();
    if (body && body.enabled === false) await removeSelf();
  } catch {
    // 電波がない・届かないときは、そのまま使う
  }
}

self.addEventListener("install", (event) => {
  if (SELF_UNREGISTER) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // HTTP の置き場所を飛ばして、組み立てたばかりのファイルを取る（外枠は /match/ の道で取る）
      const assets = PRECACHE.filter((path) => path !== "/index.html");
      await cache.addAll([SHELL, ...assets].map((path) => new Request(path, { cache: "reload" })));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (SELF_UNREGISTER) {
        await removeSelf();
        return;
      }
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (SELF_UNREGISTER) return;
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API の答えは持たない・触らない
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    if (!url.pathname.startsWith(SCOPE_PATH)) return;
    event.waitUntil(Promise.all([checkSetting(), refreshShell()]));
    event.respondWith(
      (async () => {
        const cached = await caches.match(SHELL, { cacheName: CACHE_NAME });
        return cached ?? fetch(request);
      })(),
    );
    return;
  }
  if (!PRECACHED.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(url.pathname, { cacheName: CACHE_NAME });
      return cached ?? fetch(request);
    })(),
  );
});
