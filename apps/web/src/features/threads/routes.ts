// Threads の運用の画面の道（道の形は paths.ts）。画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。
// どれも管理の外枠（staticData.layout を書かない）で、ログインが要る（画面の中で SessionGate で包む）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { STOCK_TABS, THREADS_ROUTE_PATTERNS } from "./paths.ts";
import type { StockTab } from "./paths.ts";

/** Threads の入口（最後に開いた運用アカウントのホームか、一覧へ移る。threads-012）。 */
export const threadsLandingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.landing,
  component: lazyRouteComponent(() => import("./LandingPage.tsx"), "LandingPage"),
});

/** 運用アカウントのホーム（次にやること・材料のカード。threads-012）。 */
export const threadsHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.home,
  component: lazyRouteComponent(() => import("./HomePage.tsx"), "HomeRoute"),
});

/** 運用アカウントの一覧。 */
export const threadsAccountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.accounts,
  component: lazyRouteComponent(() => import("./AccountsPage.tsx"), "AccountsPage"),
});

/** 投稿の案（承認待ち・承認済み・投稿済み・投稿に失敗・却下）。選んだ状態は ?tab= に残す（threads-011）。 */
export const threadsStockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.stock,
  validateSearch: (search: Record<string, unknown>): { tab?: StockTab } =>
    typeof search.tab === "string" && (STOCK_TABS as readonly string[]).includes(search.tab)
      ? { tab: search.tab as StockTab }
      : {},
  component: lazyRouteComponent(() => import("./StockPage.tsx"), "StockRoute"),
});

/** 案を作る（プロンプトをコピーし、外の AI の答えを貼る）。 */
export const threadsCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.create,
  component: lazyRouteComponent(() => import("./CreatePage.tsx"), "CreateRoute"),
});

/** 戦略。 */
export const threadsStrategyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.strategy,
  component: lazyRouteComponent(() => import("./StrategyPage.tsx"), "StrategyRoute"),
});

/** 設定（名前・投稿のルール・NG ワード・消す）。 */
export const threadsSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.settings,
  component: lazyRouteComponent(() => import("./SettingsPage.tsx"), "SettingsRoute"),
});

/** 反応（threads-003）。 */
export const threadsPerformanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.performance,
  component: lazyRouteComponent(() => import("./PerformancePage.tsx"), "PerformanceRoute"),
});

/** 宣伝とリサーチ（threads-004）。 */
export const threadsResearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.research,
  component: lazyRouteComponent(() => import("./ResearchPage.tsx"), "ResearchRoute"),
});

/** アルゴリズムの分析（threads-006）。 */
export const threadsAnalysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.analysis,
  component: lazyRouteComponent(() => import("./AnalysisPage.tsx"), "AnalysisRoute"),
});

/** 外部メディアの一覧と既定値（threads-008）。 */
export const threadsMediaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.media,
  component: lazyRouteComponent(() => import("./MediaPage.tsx"), "MediaRoute"),
});

/** 宣伝×媒体の掲載文（threads-008）。 */
export const threadsListingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.listing,
  component: lazyRouteComponent(() => import("./ListingPage.tsx"), "ListingRoute"),
});

/** Threads の許可の画面から戻った人を受け止める画面（threads-010。ログインが要る）。 */
export const threadsOauthCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.oauthComplete,
  validateSearch: (
    search: Record<string, unknown>,
  ): { state?: string; code?: string; error?: string } => ({
    ...(typeof search.state === "string" ? { state: search.state } : {}),
    ...(typeof search.code === "string" ? { code: search.code } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  component: lazyRouteComponent(() => import("./OauthCompletePage.tsx"), "OauthCompleteRoute"),
});

/** Meta のデータの削除の状況（threads-010。ログインなし・ナビなし）。 */
export const threadsDataDeletionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.dataDeletion,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./DataDeletionPage.tsx"), "DataDeletionRoute"),
});

/** トークンの作り方の詳しい手順（threads-012。運用アカウントの外。ログインが要る）。 */
export const threadsTokenGuideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.tokenGuide,
  component: lazyRouteComponent(() => import("./TokenGuidePage.tsx"), "TokenGuideRoute"),
});

/** 見られるチーム（threads-016。ナビの「チーム」）。 */
export const threadsTeamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.teams,
  component: lazyRouteComponent(() => import("./TeamsPage.tsx"), "TeamsPage"),
});

/** Threads のチームの画面（運用アカウント・担当を決める・運用状況。threads-016）。 */
export const threadsTeamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.team,
  component: lazyRouteComponent(() => import("./TeamPage.tsx"), "TeamRoute"),
});

/** 見せてもらっている運用アカウント（投稿の案と戦略を読むだけ。threads-013）。 */
export const threadsSharedAccountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: THREADS_ROUTE_PATTERNS.sharedAccount,
  component: lazyRouteComponent(() => import("./SharedAccountPage.tsx"), "SharedAccountRoute"),
});
