// 外枠のナビに出す交流会の項目（core-003。組み立てが feature.useNavItems を外枠に渡す）。
// - 交流会の外：「交流会の一覧」だけ
// - 交流会の中（/admin/events/$eventId…）：「交流会の一覧」と、役目で出す項目（参加者・合計／困りごと〈主催者〉／準備〈主催者〉）。
//   項目は道が道の木に登録されているものだけ（admin-tabs.ts）。「準備」には交流会を直す（A2）も含める。
// 役目は、画面が読んだ交流会（EventAccessGate・useEvent と同じ問い合わせの鍵）から読む。ナビのために問い合わせを始めない
// （enabled: false。ログインの前に 401 を出さない）。読みこむ前・失敗したときは「交流会の一覧」だけ。
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ADMIN_ROUTE_PATTERNS, adminPaths } from "@workspace/contracts/event";
import type { NavItem } from "../../lib/feature.ts";
import { availableAdminTabs } from "./admin-tabs.ts";
import { fetchEvent } from "./api.ts";
import { useRegisteredPaths } from "./navigation.tsx";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 「交流会の一覧」の項目（はじめの画面〈/〉の行き先でもある）。 */
export const EVENT_LIST_NAV = {
  label: "交流会の一覧",
  to: ADMIN_ROUTE_PATTERNS.eventList,
  icon: "list",
} as const;

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
 * 外枠のナビに出す交流会の項目。
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
  const list: NavItem = { id: "event-list", ...EVENT_LIST_NAV };
  if (!eventId || !event) return [list];
  const tabs = availableAdminTabs(event.myRole, registered).map((tab): NavItem => ({
    id: `event-${tab.id}`,
    label: tab.label,
    to: tab.path(eventId),
    icon: tab.icon,
    ...(tab.id === "setup" ? { also: [adminPaths.eventEdit(eventId)] } : {}),
  }));
  return [list, ...tabs];
}
