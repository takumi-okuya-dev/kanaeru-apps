// 画面の組み立て（Vite）。
// 設定はルートの .env を読む。画面に埋めるのは APP_NAME だけ（秘密の値は渡さない）。
// /api は API へ中継し、ブラウザから見て画面と API を同じ源にする（ログインを足したとき、クッキーを SameSite=Lax のまま使える）。
// 守りの見出し：開発のサーバーと vite preview の両方につける。CSP は組み立てたもの（vite preview）だけ
// （開発のサーバーは React の更新の仕組みが、中に書いた script と WebSocket を使うため）。本番の置き場所でも同じ見出しをつける。
// 画面から外の源を読むときは、ここの CSP と本番の置き場所の見出しを一緒に直す。受け付ける宛先は localhost だけ（手元の外から届かない）。
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** 開発のサーバーと vite preview の両方につける守りの見出し。 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** 組み立てたもの（vite preview）の CSP。index.html に中に書いた script はない（APP_NAME は題の文字に埋めるだけ）。 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

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
  const port = Number(env.WEB_PORT || 5173);
  const proxy = { "/api": { target: apiProxyTarget(env) } };
  return {
    envDir,
    plugins: [react(), tailwindcss(), appName(name)],
    define: { __APP_NAME__: JSON.stringify(name) },
    server: { host: "localhost", port, strictPort: true, proxy, headers: SECURITY_HEADERS },
    preview: {
      host: "localhost",
      port,
      strictPort: true,
      proxy,
      headers: { ...SECURITY_HEADERS, "Content-Security-Policy": CONTENT_SECURITY_POLICY },
    },
  };
});
