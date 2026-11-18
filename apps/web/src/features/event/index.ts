// 交流会の画面の入口（docs/apps/event.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// ほかの領域（reception・survey）は、ここからだけ読む：管理の画面の行き来（EventAdminNav）・交流会の読みこみと
// 役目の確かめ（useEvent・EventAccessGate）・要約（useEventSummary）・日時と参加費の見せ方。
// 管理の画面の道の形は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS・adminPaths。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import type { WebFeature } from "../../lib/feature.ts";
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
export { EventAdminNav } from "./EventAdminNav.tsx";
export type { EventAdminNavProps } from "./EventAdminNav.tsx";
export { formatEventDateTime, formatFee, formatJstDate } from "./format.ts";
export { InternalLink } from "./navigation.tsx";
export { EVENT_QUERY_KEYS, useEvent, useEventSummary } from "./queries.ts";

/** 交流会の領域が出すもの（ナビに「交流会」。はじめの画面〈/〉もここへ移る）。 */
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
  nav: { label: "交流会", to: ADMIN_ROUTE_PATTERNS.eventList },
} satisfies WebFeature;
