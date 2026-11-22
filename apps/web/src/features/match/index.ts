// 試合表の画面の入口（docs/apps/match.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { matchListRoute } from "./routes.ts";

/** 試合表の領域が出すもの（ナビの項目は match-002 で足す）。 */
export const feature = {
  id: "match",
  routes: [matchListRoute],
} satisfies WebFeature;
