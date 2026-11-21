// 画面のファイルを返す（構成の決めごと AD-8）。
// 設定 WEB_DIST_DIR（組み立てた画面のフォルダ）があるとき、組み立て（app.ts）が /api 以外の道につなぐ。
// - ファイルがあれば返す（@hono/node-server の serveStatic。.. や %2e などの道は中で止まる）
// - /assets/ の下でファイルがなければ、返さずに次（API の 404）へ渡す（壊れた JS を HTML で返さない）
// - ほかの道でファイルがなければ index.html（SPA。画面の道は画面の道具が決める。参加者の道に . があってもよい）
// - キャッシュの見出しは、ファイルを返せた応答（200・206）だけに付ける（416 などに長いキャッシュを付けない）
// 守りの見出しは、/api は API の CSP（app.ts）、ほかは画面の CSP（ここ）。カメラは試合表の道だけで許す（core-015）。
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

/** 画面の CSP（Hono の secureHeaders の形）。LINE の源は research.md R7。Threads の画像の源は core-008。 */
export const WEB_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  // LIFF の古い拡張と、古い Android の外のブラウザで読む部品（static.line-scdn.net）
  scriptSrc: ["'self'", "https://static.line-scdn.net"],
  styleSrc: ["'self'"],
  // LINE のプロフィールの画像（liff.getProfile の pictureUrl）と、Threads のプロフィールの画像（Threads の API の
  // threads_profile_picture_url。Meta の画像の置き場所 *.cdninstagram.com・*.fbcdn.net）
  imgSrc: [
    "'self'",
    "data:",
    "https://profile.line-scdn.net",
    "https://*.cdninstagram.com",
    "https://*.fbcdn.net",
  ],
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
 * カメラを自分の源に許す画面の道の頭（試合表の道。電波なしで渡す QR と、受付の QR をカメラで読む。AD-27・AD-30・core-015）。
 * ほかの道は今までどおりカメラを止める。道の比べ方は lib/liff.ts の LIFF を始めない道と同じ（大文字と小文字を分ける）。
 */
export const CAMERA_PATH_PREFIXES: readonly string[] = ["/match"];

/**
 * カメラを許す画面の道か（/match そのものと /match/ の下だけ。/matchfoo は違う）。
 * @param path 要求の道
 * @returns カメラを許すなら true
 */
export function allowsCamera(path: string): boolean {
  return CAMERA_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * 画面の守りの見出し。HSTS は、設定の WEB_URL が https のときだけ出す（環境の名前で分けない）。
 * Permissions-Policy は、カメラを許す道（allowsCamera）だけ `camera=(self)`、ほかは `camera=()`。
 * @param webUrl 画面の源（設定の WEB_URL）
 * @returns middleware
 */
export function webSecureHeaders(webUrl: string): MiddlewareHandler {
  const https = new URL(webUrl).protocol === "https:";
  const options = {
    contentSecurityPolicy: WEB_CSP_DIRECTIVES,
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: https ? `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains` : false,
  } as const;
  const plain = secureHeaders({
    ...options,
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  });
  const withCamera = secureHeaders({
    ...options,
    permissionsPolicy: { camera: ["self"], microphone: [], geolocation: [] },
  });
  return (c, next) => (allowsCamera(c.req.path) ? withCamera(c, next) : plain(c, next));
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
