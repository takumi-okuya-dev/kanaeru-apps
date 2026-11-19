// 受付の画面の道（参加者が開くチェックインの道は @workspace/contracts/core の PARTICIPANT_ROUTE_PATTERNS、
// 管理の画面の道は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS。ここで道の文字を作り直さない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/** P1 チェックインの画面（参加者が受付QRから開く道。AD-14）。 */
export const checkinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PARTICIPANT_ROUTE_PATTERNS.checkin,
  // 参加者が開く画面なので、外枠のナビを出さない（core-003）
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./CheckinPage.tsx"), "CheckinRoute"),
});

/** A3 一覧画面の参加者・合計。 */
export const receptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventReception,
  component: lazyRouteComponent(() => import("./ReceptionPage.tsx"), "ReceptionRoute"),
});

/** A5 書き出しと削除。 */
export const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventData,
  component: lazyRouteComponent(() => import("./DataPage.tsx"), "DataRoute"),
});
