// 道の根（TanStack Router。コードで書く形）。領域は、自分の道を createRoute({ getParentRoute: () => rootRoute, … }) で作り、
// features/<領域>/index.ts から出す。外枠・見つからない画面は、組み立て（router.tsx）が rootRoute.update で入れる。
// 道の型は、組み立てが Register に入れる（Link の to と params が型で確かめられる）。
// 外枠の形は、道の静かな値（staticData.layout）で、持ち主の領域が自分の道に書く（参加者が開く道は "bare"）。
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

/** 道の文脈（loader・beforeLoad が読める）。 */
export type RouterContext = {
  /** TanStack Query の入れ物 */
  queryClient: QueryClient;
};

/**
 * 外枠の形。
 * - "admin"：管理の外枠（PC は開閉できるサイドバー、スマホは下のタブバー）。書かない道はこれ
 * - "bare"：ナビなし（帯はアプリの名前だけ）。参加者が開く道（チェックイン・アンケート・招待）と手元のログイン
 */
export type ShellLayout = "admin" | "bare";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** 外枠の形（書かなければ "admin"） */
    layout?: ShellLayout;
  }
}

/** 道の根。 */
export const rootRoute = createRootRouteWithContext<RouterContext>()({});
