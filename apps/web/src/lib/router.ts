// 道の根（TanStack Router。コードで書く形）。領域は、自分の道を createRoute({ getParentRoute: () => rootRoute, … }) で作り、
// features/<領域>/index.ts から出す。外枠・見つからない画面は、組み立て（router.tsx）が rootRoute.update で入れる。
// 道の型は、組み立てが Register に入れる（Link の to と params が型で確かめられる）。
// 外枠の形は、道の静かな値（staticData.layout）で、持ち主の領域が自分の道に書く（参加者が開く道は "bare"）。
// LIFF を始めずに開いた（試合表の道。AD-4 の例外）あとで、LIFF の要る道へ移るときは、根の道がページを読み直す（core-013）。
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, redirect } from "@tanstack/react-router";
import { mustReloadForLiff } from "./liff.ts";

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

/**
 * 外枠の画面（どのアプリにも属さない画面。core-005）。
 * - "apps"：すべてのアプリ（ナビの項目を出さない）
 * - "settings"：設定（ナビは設定の項目。スマホは一覧の画面から入る）
 */
export type ShellSection = "apps" | "settings";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** 外枠の形（書かなければ "admin"） */
    layout?: ShellLayout;
    /** 外枠の画面か（書かなければ、道を出した領域が属するアプリの画面） */
    section?: ShellSection;
  }
}

/** 道の根。 */
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ location }) => {
    // LIFF を始めずに開いたあと（試合表の道）、LIFF の要る道へ移るなら、同じ URL でページを読み直す。
    // 読み直すと、組み立て（main.tsx）がその道で LIFF を始める（ほかの道の始まり方を今と同じにする。AD-4）
    if (mustReloadForLiff(location.pathname)) {
      // TanStack Router は、移す先を投げて伝える（redirect は Error でない）
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ href: location.href, reloadDocument: true, replace: true });
    }
  },
});
