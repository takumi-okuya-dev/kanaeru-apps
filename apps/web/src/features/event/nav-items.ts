// 外枠のナビに出す交流会の項目（core-003・core-022。組み立てが feature.useNavItems を外枠に渡す）。
// 「交流会の一覧」と、役目で出す項目（参加者・合計／困りごと〈主催者〉／準備〈主催者〉）を、**いつも出す**（core-022）。
// - 交流会の中（/admin/events/$eventId…）：その交流会へ進む。画面が読んだら、直前に開いた交流会として端末に置く（last-event.ts）。
// - 交流会の外（一覧など）：直前に開いた交流会へ進む。記録がなければ、項目を薄く出し、押すと案内して一覧へ進む（NavItem.disabled）。
//   交流会の中で、まだ読みこんでいない・失敗したときは、同じ交流会の記録があればそれ、なければ薄く出す。
// 項目は道が道の木に登録されているものだけ（admin-tabs.ts）。「準備」には交流会を直す（A2）も含める。
// 役目は、画面が読んだ交流会（EventAccessGate・useEvent と同じ問い合わせの鍵）か、記録から読む。ナビのために問い合わせを始めない
// （enabled: false。ログインの前に 401 を出さない）。
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ADMIN_ROUTE_PATTERNS, adminPaths } from "@workspace/contracts/event";
import type { NavItem } from "../../lib/feature.ts";
import { useEffect } from "react";
import { EVENT_ADMIN_TABS, availableAdminTabs } from "./admin-tabs.ts";
import { fetchEvent } from "./api.ts";
import { readLastEvent, writeLastEvent } from "./last-event.ts";
import type { LastEvent } from "./last-event.ts";
import { useRegisteredPaths } from "./navigation.tsx";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 「交流会の一覧」の項目（はじめの画面〈/〉の行き先でもある）。 */
export const EVENT_LIST_NAV = {
  label: "交流会の一覧",
  to: ADMIN_ROUTE_PATTERNS.eventList,
  icon: "list",
} as const;

/** 薄い項目を押したときの案内の文（一覧へ進んで、画面の上に出す）。 */
export const PICK_EVENT_MESSAGE = "先に交流会を選んでください";

/** 交流会の中の道の頭（TanStack Router の道の ID）。 */
const EVENT_SCOPE = ADMIN_ROUTE_PATTERNS.eventReception;

/**
 * 今の道が交流会の中なら、その交流会の ID。
 * @returns 交流会の ID（外なら undefined）
 */
function useCurrentEventId(): string | undefined {
  return useRouterState({
    select: (state) => {
      const leaf = state.matches.at(-1);
      if (!leaf) return undefined;
      const inScope = leaf.routeId === EVENT_SCOPE || leaf.routeId.startsWith(`${EVENT_SCOPE}/`);
      if (!inScope) return undefined;
      const { eventId } = leaf.params as { eventId?: string };
      return eventId;
    },
  });
}

/**
 * 項目の行き先にする交流会。
 * @param currentId 今の道の交流会の ID（外なら undefined）
 * @param myRole 画面が読んだ今の交流会での役目（読んでいなければ undefined）
 * @param last 直前に開いた交流会の記録
 * @returns 行き先の交流会と役目（決められなければ undefined）
 */
function targetEvent(
  currentId: string | undefined,
  myRole: LastEvent["role"] | undefined,
  last: LastEvent | undefined,
): LastEvent | undefined {
  if (currentId && myRole) return { eventId: currentId, role: myRole };
  // 中でまだ読みこんでいない・失敗：同じ交流会の記録だけを使う（別の交流会の役目は使わない）
  if (currentId) return last?.eventId === currentId ? last : undefined;
  return last;
}

/**
 * 外枠のナビに出す交流会の項目（いつも出す。core-022）。
 * @returns ナビの項目（並びの順）
 */
export function useEventNavItems(): readonly NavItem[] {
  const eventId = useCurrentEventId();
  const registered = useRegisteredPaths();
  const { data: event } = useQuery({
    queryKey: EVENT_QUERY_KEYS.detail(eventId ?? ""),
    queryFn: () => fetchEvent(eventId ?? ""),
    enabled: false,
  });
  const myRole = event?.myRole;
  useEffect(() => {
    // 画面が読んだら、直前に開いた交流会として端末に置く（外から同じ交流会へ戻れるように）
    if (eventId && myRole) writeLastEvent({ eventId, role: myRole });
  }, [eventId, myRole]);

  const list: NavItem = { id: "event-list", ...EVENT_LIST_NAV };
  const target = targetEvent(eventId, myRole, readLastEvent());
  if (!target) {
    // 行き先の交流会が決められない：登録された3つを薄く出す（押すと案内して一覧へ）
    const dim = EVENT_ADMIN_TABS.filter((tab) => registered.has(tab.pattern)).map(
      (tab): NavItem => ({
        id: `event-${tab.id}`,
        label: tab.label,
        to: EVENT_LIST_NAV.to,
        icon: tab.icon,
        disabled: { message: PICK_EVENT_MESSAGE },
      }),
    );
    return [list, ...dim];
  }
  const tabs = availableAdminTabs(target.role, registered).map((tab): NavItem => ({
    id: `event-${tab.id}`,
    label: tab.label,
    to: tab.path(target.eventId),
    icon: tab.icon,
    ...(tab.id === "setup" ? { also: [adminPaths.eventEdit(target.eventId)] } : {}),
  }));
  return [list, ...tabs];
}
