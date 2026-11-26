// アカウントの画面の道。手元のログイン（/dev/login）だけ（ログインそのものは LINE で済むので、参加者の画面はない）。
// 手元のログインの画面は約束（zod）を値で読むので、開いたときに別に読む（lazyRouteComponent）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/**
 * 戻る道として使えるか（/ で始まる同じ源の道だけ）。// で始まるもの・\ を含むもの（ブラウザが / に読みかえ、
 * /\evil.example が //evil.example になる）・今の源で読んだときに源が変わるもの（タブや改行を除くと // になるなど）は使わない。
 * @param value 問い合わせの redirect
 * @returns 使えるなら true
 */
export function isSafeRedirect(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  const origin = window.location.origin;
  return URL.canParse(value, origin) && new URL(value, origin).origin === origin;
}

/** 手元のログイン（/dev/login?redirect=…）。 */
export const devLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/login",
  // ログインの前の画面なので、外枠のナビを出さない（core-003）
  staticData: { layout: "bare" },
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    isSafeRedirect(search.redirect) ? { redirect: search.redirect } : {},
  component: lazyRouteComponent(() => import("./DevLoginRoute.tsx"), "DevLoginRoute"),
});

/**
 * 同意の画面（/oauth/consent）。認可の要求は、画面の部品が URL から文字列のまま読む（oauth-consent-request.ts）。
 * 外枠のナビを出さない（ログインの前の画面と同じく、認可の途中の画面）。
 * 道の名前が領域（account）で始まらないのは、API（/api/oauth/authorize）が送る先として決まった道のため。
 */
export const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/consent",
  staticData: { layout: "bare" },
  validateSearch: (search: Record<string, unknown>): Record<string, unknown> => search,
  component: lazyRouteComponent(() => import("./OAuthConsentRoute.tsx"), "OAuthConsentRoute"),
});
