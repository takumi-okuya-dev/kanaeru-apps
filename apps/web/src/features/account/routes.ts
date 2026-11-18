// アカウントの画面の道。手元のログイン（/dev/login）だけ（ログインそのものは LINE で済むので、参加者の画面はない）。
// 手元のログインの画面は約束（zod）を値で読むので、開いたときに別に読む（lazyRouteComponent）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/**
 * 戻る道として使えるか（/ で始まる同じ源の道だけ。// で始まる外の源は使わない）。
 * @param value 問い合わせの redirect
 * @returns 使えるなら true
 */
export function isSafeRedirect(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/** 手元のログイン（/dev/login?redirect=…）。 */
export const devLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/login",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    isSafeRedirect(search.redirect) ? { redirect: search.redirect } : {},
  component: lazyRouteComponent(() => import("./DevLoginRoute.tsx"), "DevLoginRoute"),
});
