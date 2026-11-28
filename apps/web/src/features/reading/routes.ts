// 読書記録の画面の道（道の形は paths.ts）。どれも管理の外枠（staticData.layout を書かない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。ログインは画面の中の SessionGate が確かめる。
// マーカーの文・検索の言葉は道に載せない（validateSearch を使わない。PRD 5章）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { READING_ROUTE_PATTERNS } from "./paths.ts";

/** 本棚。 */
export const readingShelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.shelf,
  component: lazyRouteComponent(() => import("./ShelfPage.tsx"), "ShelfPage"),
});

/** 本を足す。 */
export const readingAddBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.addBook,
  component: lazyRouteComponent(() => import("./AddBookPage.tsx"), "AddBookPage"),
});

/** 本の画面。 */
export const readingBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.book,
  component: lazyRouteComponent(() => import("./BookPage.tsx"), "BookRoute"),
});

/** 取りこむ。 */
export const readingImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.import,
  component: lazyRouteComponent(() => import("./ImportPage.tsx"), "ImportPage"),
});

/** 確かめてから入れる。 */
export const readingConfirmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.confirm,
  component: lazyRouteComponent(() => import("./ConfirmImportPage.tsx"), "ConfirmImportPage"),
});
