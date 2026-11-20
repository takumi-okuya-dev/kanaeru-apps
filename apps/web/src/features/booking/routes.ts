// 予約の画面の道（形は @workspace/contracts/booking の BOOKING_ROUTE_PATTERNS。ここで道の文字を作り直さない）。
// 交流会の中の管理の画面（外枠は管理の形）。画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。
import { BOOKING_ROUTE_PATTERNS } from "@workspace/contracts/booking";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/** A2 名簿。 */
export const rosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.roster,
  component: lazyRouteComponent(() => import("./RosterPage.tsx"), "RosterRoute"),
});

/** A3 名簿に入れる。 */
export const rosterImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.rosterImport,
  component: lazyRouteComponent(() => import("./ImportPage.tsx"), "ImportRoute"),
});

/** S1 名簿に当てる。 */
export const rosterMatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.rosterMatch,
  component: lazyRouteComponent(() => import("./MatchPage.tsx"), "MatchRoute"),
});
