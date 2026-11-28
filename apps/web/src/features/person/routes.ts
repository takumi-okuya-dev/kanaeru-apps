// 人物メモの画面の道（道の形は paths.ts。research R12）。どれも管理の外枠（staticData.layout を書かない）。
// 画面は約束（zod）を読むので、開いたときに別に読む（lazyRouteComponent）。ログインは画面の中の SessionGate が確かめる。
// 探す言葉とタグは道に載せない（validateSearch を使わない。AD-31）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { PERSON_ROUTE_PATTERNS } from "./paths.ts";

/** 人の一覧と検索。 */
export const personListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.list,
  component: lazyRouteComponent(() => import("./ListPage.tsx"), "ListPage"),
});

/** 人を足す。 */
export const personCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.create,
  component: lazyRouteComponent(() => import("./NoteFormPage.tsx"), "NoteNewPage"),
});

/** 人のメモ。 */
export const personNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.note,
  component: lazyRouteComponent(() => import("./NotePage.tsx"), "NoteRoute"),
});

/** 会った場の一覧。 */
export const personMeetingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.meetings,
  component: lazyRouteComponent(() => import("./MeetingsPage.tsx"), "MeetingsPage"),
});

/** 会った場（続けて足す）。 */
export const personMeetingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PERSON_ROUTE_PATTERNS.meeting,
  component: lazyRouteComponent(() => import("./MeetingPage.tsx"), "MeetingRoute"),
});
