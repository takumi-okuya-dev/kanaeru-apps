// 道の組み立て（TanStack Router。コードで書く形）。features.list.ts の領域の道とナビをつなぐ。
// 領域を足しても、このファイルは直さない（features.list.ts に1行足す。docs/rules/coding.md 6-6）。
// はじめの画面（/）は、ナビの最初の項目へ移す。
import type { QueryClient } from "@tanstack/react-query";
import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import * as features from "./features.list.ts";
import type { WebFeature } from "./lib/feature.ts";
import { rootRoute } from "./lib/router.ts";
import { AppShell } from "./shell/AppShell.tsx";
import type { NavItem } from "./shell/AppShell.tsx";
import { ErrorPage } from "./shell/ErrorPage.tsx";
import { NotFoundPage } from "./shell/NotFoundPage.tsx";

/** 登録された領域（features.list.ts の順）。型を消さないよう、WebFeature[] と書かない（道の型が Link の to を確かめる）。 */
const registered = Object.values(features).map((module) => module.feature);

/** ナビの項目（features.list.ts の順）。 */
export const navItems: readonly NavItem[] = registered.flatMap((feature: WebFeature) =>
  feature.nav ? [{ id: feature.id, label: feature.nav.label, to: feature.nav.to }] : [],
);

rootRoute.update({
  component: () => <AppShell navItems={navItems} />,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

/** はじめの画面（ナビの最初の項目へ移す）。 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    const first = navItems[0];
    // TanStack Router は、移す先を投げて伝える（redirect は Error でない）
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (first) throw redirect({ to: first.to, replace: true });
  },
  component: NotFoundPage,
});

/** 道の木。 */
export const routeTree = rootRoute.addChildren([
  indexRoute,
  ...registered.flatMap((feature) => feature.routes),
]);

/**
 * 道の道具を作る。
 * @param queryClient TanStack Query の入れ物
 * @returns 道の道具
 */
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: false });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
