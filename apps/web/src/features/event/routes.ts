// 交流会の画面の道（管理の画面の道の形は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS、
// 参加者が開く招待の道は @workspace/contracts/core の PARTICIPANT_ROUTE_PATTERNS。ここで道の文字を作り直さない）。
// 画面は約束（zod）や QR の道具を読むので、開いたときに別に読む（lazyRouteComponent）。
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { ADMIN_ROUTE_PATTERNS, QR_KINDS } from "@workspace/contracts/event";
import type { QrKind } from "@workspace/contracts/event";
import { createRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";

/** A1 交流会の一覧。 */
export const eventListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventList,
  component: lazyRouteComponent(() => import("./EventListPage.tsx"), "EventListPage"),
});

/** A2 交流会の作成。 */
export const eventNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventNew,
  component: lazyRouteComponent(() => import("./EventFormPage.tsx"), "EventNewPage"),
});

/** A2 交流会の編集。 */
export const eventEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventEdit,
  component: lazyRouteComponent(() => import("./EventFormPage.tsx"), "EventEditRoute"),
});

/** A4 準備。 */
export const eventSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventSetup,
  component: lazyRouteComponent(() => import("./EventSetupPage.tsx"), "EventSetupRoute"),
});

/**
 * QR の種類か。
 * @param value 道の値
 * @returns 種類なら true
 */
function isQrKind(value: string): value is QrKind {
  return (QR_KINDS as readonly string[]).includes(value);
}

/** QR の印刷（$kind は checkin・survey。ほかは見つからない画面）。 */
export const eventQrPrintRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ADMIN_ROUTE_PATTERNS.eventQrPrint,
  params: {
    parse: (params: { eventId: string; kind: string }) => {
      // TanStack Router は、見つからないことを投げて伝える（notFound は Error でない）
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (!isQrKind(params.kind)) throw notFound();
      return { eventId: params.eventId, kind: params.kind };
    },
    stringify: (params: { eventId: string; kind: QrKind }) => params,
  },
  component: lazyRouteComponent(() => import("./QrPrintPage.tsx"), "QrPrintRoute"),
});

/** P3 受付係の招待（参加者が外から開く道。AD-14）。 */
export const inviteAcceptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PARTICIPANT_ROUTE_PATTERNS.invite,
  // 参加者が開く画面なので、外枠のナビを出さない（core-003）
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./InviteAcceptPage.tsx"), "InviteAcceptRoute"),
});
