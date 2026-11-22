// 試合表の運営の画面の道（道の形は paths.ts）。大きく映す（M3）のほかは管理の外枠（staticData.layout を書かない）。
// 大きく映す画面はコートの横の端末に出すので、ナビのない外枠（"bare"）にする（match-003）。見るだけのページと受付のページは
// ログインなしで参加者が開くので "bare"（match-004。ログインを確かめる MatchGate を使わない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。ログインは画面の中の MatchGate が確かめる
// （試合表の道は LIFF を始めないので、account の SessionGate を使わない。core-013）。
// どの道も、入ったときに Service Worker を入れる・外す（機能の印 match.offline。AD-27。offline/start.ts。match-005）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { enterMatchRoute } from "./offline/start.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";

/** M0 試合表の一覧。 */
export const matchListRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.list,
  component: lazyRouteComponent(() => import("./ListPage.tsx"), "ListPage"),
});

/** M0 試合表を作る。 */
export const matchCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.create,
  component: lazyRouteComponent(() => import("./CreatePage.tsx"), "CreatePage"),
});

/** M1 名簿と設定。 */
export const matchRosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.roster,
  component: lazyRouteComponent(() => import("./RosterPage.tsx"), "RosterRoute"),
});

/** M2・M6 試合表。 */
export const matchBoardRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.board,
  component: lazyRouteComponent(() => import("./BoardPage.tsx"), "BoardRoute"),
});

/** M5・R1 印刷。 */
export const matchPrintRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.print,
  component: lazyRouteComponent(() => import("./PrintPage.tsx"), "PrintRoute"),
});

/** M3 大きく映す（ナビなし）。 */
export const matchBigRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.big,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./BigPage.tsx"), "BigRoute"),
});

/** 見るだけのページのリンクと QR（運営）。 */
export const matchViewLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.viewLink,
  component: lazyRouteComponent(() => import("./ViewLinkPage.tsx"), "ViewLinkRoute"),
});

/** M7 QR で受け付ける（運営）。 */
export const matchJoinAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.joinAdmin,
  component: lazyRouteComponent(() => import("./JoinAdminPage.tsx"), "JoinAdminRoute"),
});

/** P1 見るだけのページ（ログインなし・ナビなし）。 */
export const matchViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.view,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./ViewPage.tsx"), "ViewRoute"),
});

/** P2・P3 受付のページ（ログインなし・ナビなし）。 */
export const matchJoinRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: enterMatchRoute,
  path: MATCH_ROUTE_PATTERNS.join,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./JoinPage.tsx"), "JoinRoute"),
});
