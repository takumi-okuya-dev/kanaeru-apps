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
