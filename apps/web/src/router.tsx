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

/** features.list.ts の領域が出す feature の型の和（領域が1つもなければ never）。 */
type ListedFeature = {
  [K in keyof typeof features]: (typeof features)[K] extends { feature: infer F } ? F : never;
}[keyof typeof features];

/** 登録された領域の feature の型（領域が1つもないときは、道を持たない形）。 */
type RegisteredFeature = [ListedFeature] extends [never]
  ? Omit<WebFeature, "routes"> & { routes: readonly never[] }
  : ListedFeature;

/**
 * 登録された領域（features.list.ts の順）。型を消さないよう、WebFeature[] と書かない（道の型が Link の to を確かめる）。
 * 領域が0のときも型が通るよう、名前空間の値の型を RegisteredFeature で読む。
 */
export const registeredFeatures = Object.values<{ feature: RegisteredFeature }>(features).map(
  (module) => module.feature,
);

/** ナビの項目（features.list.ts の順）。 */
export const navItems: readonly NavItem[] = registeredFeatures.flatMap((feature: WebFeature) =>
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

/** 登録された領域の道の型の和（領域が2つ以上のとき、flatMap が最初の領域の道の型だけに決めないように書く）。 */
type RegisteredRoute = RegisteredFeature["routes"][number];

/** 道の木。 */
export const routeTree = rootRoute.addChildren([
  indexRoute,
  ...registeredFeatures.flatMap((feature): readonly RegisteredRoute[] => feature.routes),
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
