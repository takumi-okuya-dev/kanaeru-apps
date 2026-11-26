// 画面の組み立て（Vite）。
// 設定はルートの .env を読む。画面に埋めるのは APP_NAME と VITE_LIFF_ID（公開してよい LIFF ID）だけ（秘密の値は渡さない）。
// /api は API へ中継し、ブラウザから見て画面と API を同じ源にする（クッキーを SameSite=Lax のまま使える）。
// 組み立てた画面は、本番も E2E も API が返し、CSP などの守りの見出しも API が付ける（apps/api/src/platform/web。AD-8）。
// 画面から外の源を読むときは、そこの CSP を直す。ここでは開発のサーバーと vite preview に、CSP のほかの守りの見出しだけを付ける
// （開発のサーバーは React の更新の仕組みが、中に書いた script と WebSocket を使うため CSP を付けない）。
// 受け付ける宛先は localhost だけ（手元の外から届かない）。
// 試合表の道（/match/）だけに効く Service Worker を組み立てのときに書き出す（AD-27。scoped-service-worker.ts。core-015）。
// 試合表のホーム画面の manifest とアイコンは public/match/ に置き、その Service Worker に持たせる（match-007）。
// カメラ（QR を読む）は試合表の道だけで許す（API の web.ts と同じ。core-015）。
import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import { scopedServiceWorker } from "./scoped-service-worker.ts";
import { MATCH_HOME_SCREEN_FILES } from "./src/features/match/home-screen.ts";

const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** 開発のサーバーと vite preview の両方につける守りの見出し。 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** 試合表の道（/match/ の下）で使う見出し（カメラだけ自分の源に許す）。 */
const MATCH_SECURITY_HEADERS = {
  ...SECURITY_HEADERS,
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

/**
 * 試合表の道（/match・/match/…）では、カメラを許す見出しに差しかえる（開発のサーバーと vite preview）。
 * @returns Vite の plugin
 */
function matchCameraHeaders(): Plugin {
  const value = MATCH_SECURITY_HEADERS["Permissions-Policy"];
  const middleware = (req: { url?: string }, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (path === "/match" || path.startsWith("/match/")) {
      // あとで Vite が server.headers を書いても、この道ではカメラを許す値のままにする
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (name, header) =>
        setHeader(name, name.toLowerCase() === "permissions-policy" ? value : header);
      res.setHeader("Permissions-Policy", value);
    }
    next();
  };
  return {
    name: "match-camera-headers",
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}

/** 試合表の Service Worker の本文（領域が持つ。AD-27）。 */
const MATCH_SERVICE_WORKER = fileURLToPath(
  new URL("./src/features/match/offline/sw.js", import.meta.url),
);

/** API_HOST が空のときの宛先。 */
const DEFAULT_API_HOST = "127.0.0.1";
/** API_PORT が空のときの口の番号。 */
const DEFAULT_API_PORT = 8787;

/**
 * 設定から、/api の中継の宛先（http://宛先:口の番号）を作る。
 * @param env ルートの .env を読んだ値（API_HOST・API_PORT だけを見る）
 * @returns 中継の宛先
 * @throws {Error} API_PORT が 1〜65535 の整数でないとき
 */
function apiProxyTarget(env: Readonly<Record<string, string | undefined>>): string {
  const host = env.API_HOST?.trim() || DEFAULT_API_HOST;
  const portText = env.API_PORT?.trim();
  const port = portText ? Number(portText) : DEFAULT_API_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT は 1〜65535 の整数にしてください：${portText ?? ""}`);
  }
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${hostPart}:${port}`;
}

/**
 * HTML に埋める文字を、そのまま見える形にする。
 * @param value 埋める文字
 * @returns HTML の特別な文字を置きかえた文字
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * index.html の題に APP_NAME を埋める。
 * @param appName 画面に出す名前（設定の APP_NAME）
 * @returns Vite の plugin
 */
function appName(appName: string): Plugin {
  return {
    name: "app-name",
    transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", escapeHtml(appName)),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const name = env.APP_NAME ?? "";
  const liffId = env.VITE_LIFF_ID?.trim() ?? "";
  const port = Number(env.WEB_PORT || 5173);
  // /.well-known は認可のメタデータ（RFC 8414・9728）。MCP のクライアントは画面の源から読むので、API へ流す（core-021）
  const proxy = {
    "/api": { target: apiProxyTarget(env) },
    "/.well-known": { target: apiProxyTarget(env) },
  };
  return {
    envDir,
    plugins: [
      react(),
      tailwindcss(),
      appName(name),
      matchCameraHeaders(),
      scopedServiceWorker({
        fileName: "match/sw.js",
        template: MATCH_SERVICE_WORKER,
        includeModule: (moduleId) => moduleId.includes("/src/features/match/"),
        // ホーム画面に置くための manifest とアイコン（public/match/。電波がなくても出す。match-007）
        publicFiles: MATCH_HOME_SCREEN_FILES,
      }),
    ],
    define: { __APP_NAME__: JSON.stringify(name), __LIFF_ID__: JSON.stringify(liffId) },
    server: { host: "localhost", port, strictPort: true, proxy, headers: SECURITY_HEADERS },
    preview: {
      host: "localhost",
      port,
      strictPort: true,
      proxy,
      headers: SECURITY_HEADERS,
    },
  };
});
