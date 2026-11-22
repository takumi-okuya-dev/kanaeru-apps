// 試合表の運営の画面の道（道の形は paths.ts）。どれも管理の外枠（staticData.layout を書かない）。
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { ListPlaceholderPage } from "./ListPlaceholderPage.tsx";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";

/** 試合表の一覧（match-001 は準備中の案内だけ。一覧と作るは match-002）。 */
export const matchListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MATCH_ROUTE_PATTERNS.list,
  component: ListPlaceholderPage,
});
