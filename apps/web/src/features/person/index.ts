// 人物メモの画面の入口（docs/apps/person.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { personListRoute } from "./routes.ts";

/** 人物メモの領域が出すもの（ナビの項目は pr2 で足す）。 */
export const feature = {
  id: "person",
  routes: [personListRoute],
} satisfies WebFeature;
