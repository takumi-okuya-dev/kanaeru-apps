// 読書記録の画面の入口（docs/apps/reading.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { readingShelfRoute } from "./routes.ts";

/** 読書記録の領域が出すもの（ナビの項目「本棚」は pr2 で足す）。 */
export const feature = {
  id: "reading",
  routes: [readingShelfRoute],
} satisfies WebFeature;
