// Threads の運用の画面の入口（docs/apps/threads.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { useThreadsNavItems } from "./nav-items.ts";
import {
  threadsAccountsRoute,
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
} from "./routes.ts";

export { THREADS_QUERY_KEYS } from "./queries.ts";

/**
 * Threads の運用の領域が出すもの。決まったナビ（nav）は出さない（はじめの画面〈/〉の行き先にしない）。
 * Threads の画面の中でだけ、外枠のナビに項目を出す（useNavItems）。
 */
export const feature = {
  id: "threads",
  routes: [
    threadsAccountsRoute,
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
  ],
  useNavItems: useThreadsNavItems,
} satisfies WebFeature;
