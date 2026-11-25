// 外枠のナビに出す「名簿」（booking-001 research R13）。交流会の中で、使い方が「名簿を使う」か「自前で申込みを受ける」で、役目が主催者か受付係のときだけ。
// 役目と使い方は、画面が読んだ交流会（event の鍵）と使い方（booking の鍵）から読む。ナビのために問い合わせを始めない
// （skipToken。読みこむ前・失敗したとき・受付だけのときは何も出さない）。
import type { EventView } from "@workspace/contracts/event";
import type { BookingSetting } from "@workspace/contracts/booking";
import { bookingPaths, usesRoster } from "@workspace/contracts/booking";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import type { NavItem } from "../../lib/feature.ts";
import { EVENT_QUERY_KEYS } from "../event/index.ts";
import { BOOKING_QUERY_KEYS } from "./queries.ts";

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
      return (leaf.params as { eventId?: string }).eventId;
    },
  });
}

/**
 * 外枠のナビに出す予約の項目。
 * @returns ナビの項目（名簿を使う交流会の中で、主催者か受付係のときだけ「名簿」）
 */
export function useBookingNavItems(): readonly NavItem[] {
  const eventId = useCurrentEventId();
  const { data: event } = useQuery<EventView>({
    queryKey: EVENT_QUERY_KEYS.detail(eventId ?? ""),
    queryFn: skipToken,
  });
  const { data: setting } = useQuery<BookingSetting>({
    queryKey: BOOKING_QUERY_KEYS.setting(eventId ?? ""),
    queryFn: skipToken,
  });
  if (!eventId || !event || !setting || !usesRoster(setting.mode)) return [];
  return [{ id: "booking-roster", label: "名簿", to: bookingPaths.roster(eventId), icon: "list" }];
}
