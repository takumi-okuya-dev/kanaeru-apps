// 受付の画面の入口（docs/apps/reception.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// ほかの領域（survey）は、ここからだけ読む：A5 と A3 の直す枠に節を足す差しこみの場所（research R10）と、問い合わせの鍵。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { checkinRoute, dataRoute, receptionRoute } from "./routes.ts";

export { RECEPTION_QUERY_KEYS } from "./queries.ts";
export { registerCheckinPanelSection, registerEventDataSection } from "./slots.ts";
export type { CheckinPanelSection, EventDataSection } from "./slots.ts";

/** 受付の領域が出すもの（ナビには出さない。管理の画面の行き来は外枠のナビ。event が出す）。 */
export const feature = {
  id: "reception",
  routes: [checkinRoute, receptionRoute, dataRoute],
} satisfies WebFeature;
