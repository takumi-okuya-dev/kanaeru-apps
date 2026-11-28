// 人物メモの画面の道（道の形は paths.ts）。どれも管理の外枠（staticData.layout を書かない）。
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";
import { PERSON_ROUTE_PATTERNS } from "./paths.ts";

/** 人の一覧（pr1 は準備中の案内だけ。一覧と検索は pr2）。 */
export const personListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.list,
  component: PlaceholderPage,
});
