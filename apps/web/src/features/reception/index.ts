// 受付の画面の入口（docs/apps/reception.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// ほかの領域（survey・booking）は、ここからだけ読む：A5・A3 の直す枠・A3 の一覧の上に節を足す差しこみの場所（research R10・
// booking-001 research R13）と、問い合わせの鍵。booking が手でのチェックインの欄を作るための欄の部品と確かめ、
// 一覧画面と同じ読み直しの決め方も出す（作り直さない）。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { checkinRoute, dataRoute, receptionRoute } from "./routes.ts";

export { RECEPTION_QUERY_KEYS, isNightStop, receptionPollInterval } from "./queries.ts";
export {
  registerCheckinPanelSection,
  registerEventDataSection,
  registerReceptionSection,
} from "./slots.ts";
export type { CheckinPanelSection, EventDataSection, ReceptionSection } from "./slots.ts";
export { CheckinFields } from "./CheckinFields.tsx";
export { EMPTY_CHECKIN_FORM, focusFirstCheckinError, validateCheckinForm } from "./checkin-form.ts";
export type { CheckinFormValues } from "./checkin-form.ts";
export { SameNameFlag } from "./flags.tsx";
export { APPLICATION_SOURCE_OPTIONS } from "./format.ts";

/** 受付の領域が出すもの（ナビには出さない。管理の画面の行き来は外枠のナビ。event が出す）。 */
export const feature = {
  id: "reception",
  routes: [checkinRoute, receptionRoute, dataRoute],
} satisfies WebFeature;
