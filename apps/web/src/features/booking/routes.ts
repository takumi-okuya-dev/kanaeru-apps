// 予約の画面の道（形は @workspace/contracts/booking の BOOKING_ROUTE_PATTERNS。ここで道の文字を作り直さない）。
// 交流会の中の管理の画面（外枠は管理の形）。画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。
// 知らせ（booking-002）：設定の画面の下の予約の知らせ（staticData.section: "settings"）と、参加者が外から開く紐づけ（layout: "bare"。AD-14）。
import {
  BOOKING_ROUTE_PATTERNS,
  BOOKING_SETTINGS_ROUTE_PATTERNS,
} from "@workspace/contracts/booking";
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/** A2 名簿。 */
export const rosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.roster,
  component: lazyRouteComponent(() => import("./RosterPage.tsx"), "RosterRoute"),
});

/** A3 名簿に入れる。 */
export const rosterImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.rosterImport,
  component: lazyRouteComponent(() => import("./ImportPage.tsx"), "ImportRoute"),
});

/** S1 名簿に当てる。 */
export const rosterMatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_ROUTE_PATTERNS.rosterMatch,
  component: lazyRouteComponent(() => import("./MatchPage.tsx"), "MatchRoute"),
});

/** A4 予約の知らせ（個人。設定の画面の下）。 */
export const notifySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_SETTINGS_ROUTE_PATTERNS.notify,
  staticData: { section: "settings" },
  component: lazyRouteComponent(() => import("./NotifySettingsPage.tsx"), "NotifySettingsRoute"),
});

/** A4 予約の知らせ（組織。設定の画面の下）。 */
export const organizationNotifySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: BOOKING_SETTINGS_ROUTE_PATTERNS.notifyOrganization,
  staticData: { section: "settings" },
  component: lazyRouteComponent(
    () => import("./NotifySettingsPage.tsx"),
    "OrganizationNotifySettingsRoute",
  ),
});

/** 紐づけ（参加者が外から開く道。外枠のナビを出さない。AD-14）。 */
export const lineLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PARTICIPANT_ROUTE_PATTERNS.lineLink,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./LineLinkPage.tsx"), "LineLinkRoute"),
});
