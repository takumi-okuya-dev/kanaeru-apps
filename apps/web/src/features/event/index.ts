// 交流会の画面の入口（docs/apps/event.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// ほかの領域（reception・survey）は、ここからだけ読む：交流会の読みこみと役目の確かめ（useEvent・EventAccessGate）・
// 要約（useEventSummary）・日時と参加費の見せ方・準備の画面に節を足す差しこみの場所（registerSetupSection。booking-001）。
// 管理の画面の行き来は外枠のナビ（useNavItems。core-003）。
// 管理の画面の道の形は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS・adminPaths。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { registerLastEventReset } from "./last-event.ts";
import { EVENT_LIST_NAV, useEventNavItems } from "./nav-items.ts";
import {
  eventEditRoute,
  eventListRoute,
  eventNewRoute,
  eventQrPrintRoute,
  eventSetupRoute,
  inviteAcceptRoute,
} from "./routes.ts";

export { EventAccessGate, EventLoadFailure, OrganizerOnlyPage } from "./EventAccessGate.tsx";
export type { EventAccessGateProps } from "./EventAccessGate.tsx";
export { formatEventDateTime, formatFee, formatJstDate } from "./format.ts";
export { InternalLink } from "./navigation.tsx";
export { EVENT_QUERY_KEYS, useEvent, useEventSummary } from "./queries.ts";
export { registerSetupSection } from "./setup-slots.ts";
export type { SetupSection } from "./setup-slots.ts";

// 直前に開いた交流会の記録は、今の利用者が替わったら消す（共有の端末。core-022）
registerLastEventReset();

/**
 * 交流会の領域が出すもの（ナビに「交流会の一覧」。はじめの画面〈/〉もここへ移る）。
 * 外枠のナビには、役目で出す項目（参加者・合計／困りごと／準備）もいつも出す（useNavItems。core-022）。
 */
export const feature = {
  id: "event",
  routes: [
    eventListRoute,
    eventNewRoute,
    eventEditRoute,
    eventSetupRoute,
    eventQrPrintRoute,
    inviteAcceptRoute,
  ],
  nav: EVENT_LIST_NAV,
  useNavItems: useEventNavItems,
} satisfies WebFeature;
