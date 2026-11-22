// 試合表の運営の画面の道（道の形は paths.ts）。どれも管理の外枠（staticData.layout を書かない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。ログインは画面の中の MatchGate が確かめる
// （試合表の道は LIFF を始めないので、account の SessionGate を使わない。core-013）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";

/** M0 試合表の一覧。 */
export const matchListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.list,
  component: lazyRouteComponent(() => import("./ListPage.tsx"), "ListPage"),
});

/** M0 試合表を作る。 */
export const matchCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.create,
  component: lazyRouteComponent(() => import("./CreatePage.tsx"), "CreatePage"),
});

/** M1 名簿と設定。 */
export const matchRosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.roster,
  component: lazyRouteComponent(() => import("./RosterPage.tsx"), "RosterRoute"),
});

/** M2・M6 試合表。 */
export const matchBoardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.board,
  component: lazyRouteComponent(() => import("./BoardPage.tsx"), "BoardRoute"),
});

/** M5・R1 印刷。 */
export const matchPrintRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.print,
  component: lazyRouteComponent(() => import("./PrintPage.tsx"), "PrintRoute"),
});
