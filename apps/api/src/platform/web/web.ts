// 画面のファイルを返す（構成の決めごと AD-8）。
// 設定 WEB_DIST_DIR（組み立てた画面のフォルダ）があるとき、組み立て（app.ts）が /api 以外の道につなぐ。
// - ファイルがあれば返す（@hono/node-server の serveStatic。.. や %2e などの道は中で止まる）
// - /assets/ の下でファイルがなければ、返さずに次（API の 404）へ渡す（壊れた JS を HTML で返さない）
// - ほかの道でファイルがなければ index.html（SPA。画面の道は画面の道具が決める。参加者の道に . があってもよい）
// - キャッシュの見出しは、ファイルを返せた応答（200・206）だけに付ける（416 などに長いキャッシュを付けない）
// 守りの見出しは、/api は API の CSP（app.ts）、ほかは画面の CSP（ここ）。
// 画面の CSP は、自分の源と、LINE の SDK（@line/liff 2.32）が使う源だけを許す
// （どの源を何に使うかは specs/core/001-foundation/research.md R7。'unsafe-inline'・'unsafe-eval' は入れない）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/** HSTS の長さ（2年。https の源のときだけ出す）。 */
export const HSTS_MAX_AGE_SECONDS = 63_072_000;

/** 中身の印つきのファイル（Vite の assets）。中身が変われば名前が変わるので、長く持ってよい。 */
const IMMUTABLE_PREFIX = "/assets/";

/** 長く持ってよいファイルのキャッシュ。 */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** index.html など、毎回確かめるファイルのキャッシュ。 */
const REVALIDATE_CACHE = "no-cache";

/** 画面の CSP（Hono の secureHeaders の形）。LINE の源は research.md R7。 */
export const WEB_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  // LIFF の古い拡張と、古い Android の外のブラウザで読む部品（static.line-scdn.net）
  scriptSrc: ["'self'", "https://static.line-scdn.net"],
  styleSrc: ["'self'"],
  // LINE のプロフィールの画像（liff.getProfile の pictureUrl）
  imgSrc: ["'self'", "data:", "https://profile.line-scdn.net"],
  fontSrc: ["'self'"],
  // LIFF の SDK が呼ぶ LINE の窓口と、SDK の文言の取り寄せ
  connectSrc: [
    "'self'",
    "https://api.line.me",
    "https://access.line.me",
    "https://liff.line.me",
    "https://liffsdk.line-scdn.net",
  ],
  // 外のブラウザで LIFF の小さな窓（subWindow）が使う iframe と、そこからの送信
  frameSrc: ["https://liff-subwindow.line.me"],
  formAction: ["'self'", "https://liff-subwindow.line.me"],
  objectSrc: ["'none'"],
  baseUri: ["'none'"],
  frameAncestors: ["'none'"],
};

/**
 * API の道か（/api そのものと /api/ の下だけ。/apifoo は画面の道）。
 * @param path 要求の道
 * @returns API の道なら true
 */
export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

/**
 * 画面の守りの見出し。HSTS は、設定の WEB_URL が https のときだけ出す（環境の名前で分けない）。
 * @param webUrl 画面の源（設定の WEB_URL）
 * @returns middleware
 */
export function webSecureHeaders(webUrl: string): MiddlewareHandler {
  const https = new URL(webUrl).protocol === "https:";
  return secureHeaders({
    contentSecurityPolicy: WEB_CSP_DIRECTIVES,
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: https ? `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains` : false,
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  });
}

/**
 * 組み立てた画面のファイルを返す middleware を作る。index.html は作るときに1度だけ読む。
 * @param options 画面のフォルダ
 * @param options.distDir 組み立てた画面のフォルダ（絶対の道。設定の WEB_DIST_DIR）
 * @returns middleware（/api の道と、GET・HEAD でない要求は次へ渡す）
 * @throws {Error} フォルダに index.html がないとき（起動を止める）
 */
export function serveWeb(options: { distDir: string }): MiddlewareHandler {
  let indexHtml: string;
  try {
    indexHtml = readFileSync(join(options.distDir, "index.html"), "utf8");
  } catch {
    throw new Error(
      "WEB_DIST_DIR に index.html がありません（pnpm --filter web build で画面を組み立て、その dist を指してください）。",
    );
  }
  const files = serveStatic({ root: options.distDir });
  return async (c, next) => {
    if (isApiPath(c.req.path) || (c.req.method !== "GET" && c.req.method !== "HEAD")) {
      return next();
    }
    // ファイルがなければ、serveStatic は次（ここでは何も返さない関数）を呼び、undefined を返す
    const found = await files(c, () => Promise.resolve());
    if (found) {
      if (found.status === 200 || found.status === 206) {
        found.headers.set(
          "Cache-Control",
          c.req.path.startsWith(IMMUTABLE_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE,
        );
      }
      return found;
    }
    // /assets/ の下のないファイルは、index.html を返さず API の 404（no-store）にする
    if (c.req.path.startsWith(IMMUTABLE_PREFIX)) return next();
    c.header("Cache-Control", REVALIDATE_CACHE);
    if (c.req.method === "HEAD") {
      c.header("Content-Type", "text/html; charset=UTF-8");
      return c.body(null, 200);
    }
    return c.html(indexHtml, 200);
  };
}
