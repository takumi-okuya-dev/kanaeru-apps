// Threads の運用の画面の入口（docs/apps/threads.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { useThreadsNavItems } from "./nav-items.ts";
import {
  threadsAccountsRoute,
  threadsHomeRoute,
  threadsLandingRoute,
  threadsAnalysisRoute,
  threadsCreateRoute,
  threadsDataDeletionRoute,
  threadsOauthCompleteRoute,
  threadsListingRoute,
  threadsMediaRoute,
  threadsPerformanceRoute,
  threadsResearchRoute,
  threadsSettingsRoute,
  threadsStockRoute,
  threadsStrategyRoute,
  threadsTokenGuideRoute,
  threadsOrganizationsRoute,
  threadsOrganizationRoute,
  threadsOrganizationStatusRoute,
  threadsSharedAccountRoute,
} from "./routes.ts";

export { THREADS_QUERY_KEYS } from "./queries.ts";

/**
 * Threads の運用の領域が出すもの。決まったナビ（nav）は出さない（はじめの画面〈/〉の行き先にしない）。
 * Threads の画面の中でだけ、外枠のナビに項目を出す（useNavItems）。組織の画面への入口と招待の説明（organization。threads-013）。
 */
export const feature = {
  id: "threads",
  routes: [
    threadsLandingRoute,
    threadsAccountsRoute,
    threadsHomeRoute,
    threadsStockRoute,
    threadsCreateRoute,
    threadsStrategyRoute,
    threadsResearchRoute,
    threadsPerformanceRoute,
    threadsAnalysisRoute,
    threadsMediaRoute,
    threadsListingRoute,
    threadsSettingsRoute,
    threadsOauthCompleteRoute,
    threadsDataDeletionRoute,
    threadsTokenGuideRoute,
    threadsOrganizationsRoute,
    threadsOrganizationRoute,
    threadsOrganizationStatusRoute,
    threadsSharedAccountRoute,
  ],
  useNavItems: useThreadsNavItems,
  // 組織の画面（suite の設定 › 組織）への入口と、招待の確かめの画面の説明（threads-013。見えないときは suite が出さない）
  organization: {
    links: (organizationId: string) => [
      { label: "Threads の組織の画面", to: `/threads/organizations/${organizationId}` },
    ],
    joinNotes: [
      "運用アカウントは、組織の中のチームに入れて運用します。管理者・チームのリーダー・あなたの運用アカウントの担当の編集者は、運用状況（投稿の数・伸び・最後に動いた日）を見られます。本文と戦略は、あなたがチームに見せたときだけ読めます。",
      "あなたが退会すると、チームに入れた運用アカウントは組織の管理者に引き継がれます（Threads への接続は切れます）。",
    ],
  },
} satisfies WebFeature;
