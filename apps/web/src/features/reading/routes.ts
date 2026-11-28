// 読書記録の画面の道（道の形は paths.ts）。どれも管理の外枠（staticData.layout を書かない）。
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";
import { READING_ROUTE_PATTERNS } from "./paths.ts";

/** 本棚（pr1 は準備中の案内だけ。本棚と取りこみは pr2）。 */
export const readingShelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: READING_ROUTE_PATTERNS.shelf,
  component: PlaceholderPage,
});
