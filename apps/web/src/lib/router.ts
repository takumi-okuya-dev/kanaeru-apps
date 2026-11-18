// 道の根（TanStack Router。コードで書く形）。領域は、自分の道を createRoute({ getParentRoute: () => rootRoute, … }) で作り、
// features/<領域>/index.ts から出す。外枠・見つからない画面は、組み立て（router.tsx）が rootRoute.update で入れる。
// 道の型は、組み立てが Register に入れる（Link の to と params が型で確かめられる）。
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

/** 道の文脈（loader・beforeLoad が読める）。 */
export type RouterContext = {
  /** TanStack Query の入れ物 */
  queryClient: QueryClient;
};

/** 道の根。 */
export const rootRoute = createRootRouteWithContext<RouterContext>()({});
