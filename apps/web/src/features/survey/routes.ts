// アンケートの画面の道（参加者が開くアンケートの道は @workspace/contracts/core の PARTICIPANT_ROUTE_PATTERNS、
// 管理の画面の道は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS。ここで道の文字を作り直さない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/** P2 アンケートの画面（参加者がアンケートQR・チェックインの画面から開く道。AD-14）。 */
export const surveyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PARTICIPANT_ROUTE_PATTERNS.survey,
  component: lazyRouteComponent(() => import("./SurveyPage.tsx"), "SurveyRoute"),
});

/** 困りごと（主催者だけ。EventAdminNav の「困りごと」）。 */
export const concernsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventConcerns,
  component: lazyRouteComponent(() => import("./ConcernsPage.tsx"), "ConcernsRoute"),
});
