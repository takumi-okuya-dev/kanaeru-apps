// 外枠のナビに出す人物メモの項目。人物メモの画面（/person…）の中でだけ「人」と「会った場」を出す。
// 人のメモと人を足す画面は「人」、会った場の画面は「会った場」を今いる所にする（長く当たるほうが勝つ。shell の current-nav）。
// アイコンは項目ごとに違うものにする（core-011）。
import { useRouterState } from "@tanstack/react-router";
import type { NavItem } from "../../lib/feature.ts";
import { PERSON_ROUTE_PATTERNS } from "./paths.ts";

/** 人物メモの画面の中で出す項目。 */
const PERSON_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "person-notes",
    label: "人",
    to: PERSON_ROUTE_PATTERNS.list,
    icon: "people",
  },
  {
    id: "person-meetings",
    label: "会った場",
    to: PERSON_ROUTE_PATTERNS.meetings,
    icon: "list",
  },
];

/**
 * 外枠のナビに出す人物メモの項目（人物メモの画面の外は何も出さない）。
 * @returns ナビの項目（並びの順）
 */
export function usePersonNavItems(): readonly NavItem[] {
  const inPerson = useRouterState({
    select: (state) => {
      const routeId = state.matches.at(-1)?.routeId;
      return (
        routeId === PERSON_ROUTE_PATTERNS.list ||
        (routeId?.startsWith(`${PERSON_ROUTE_PATTERNS.list}/`) ?? false)
      );
    },
  });
  return inPerson ? PERSON_NAV_ITEMS : [];
}
