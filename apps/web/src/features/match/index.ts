// 試合表の画面の入口（docs/apps/match.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { useMatchNavItems } from "./nav-items.ts";
import {
  matchBigRoute,
  matchBoardRoute,
  matchCreateRoute,
  matchJoinAdminRoute,
  matchJoinRoute,
  matchListRoute,
  matchPrintRoute,
  matchRosterRoute,
  matchViewLinkRoute,
  matchViewRoute,
} from "./routes.ts";

/**
 * 試合表の領域が出すもの。決まったナビ（nav）は出さない（はじめの画面〈/〉の行き先にしない）。
 * 試合表の画面の中でだけ、外枠のナビに項目を出す（useNavItems）。
 */
export const feature = {
  id: "match",
  routes: [
    matchListRoute,
    matchCreateRoute,
    matchRosterRoute,
    matchBoardRoute,
    matchPrintRoute,
    matchBigRoute,
    matchViewLinkRoute,
    matchJoinAdminRoute,
    matchViewRoute,
    matchJoinRoute,
  ],
  useNavItems: useMatchNavItems,
} satisfies WebFeature;
