// 外枠のナビに出す試合表の項目。
// - 試合表の画面の外：何も出さない（外枠は今のアプリの領域の項目だけを出す）
// - 試合表の画面（/match…）：「試合表の一覧」。試合表の中では「名簿と設定」「試合表」「印刷」「見るだけのページ」「QR で受け付ける」も出す
// - アイコンは項目ごとに違うものにする（core-011）
import { useRouterState } from "@tanstack/react-router";
import type { NavItem } from "../../lib/feature.ts";
import { MATCH_ROUTE_PATTERNS, MATCH_TABLE_SCOPE, matchPaths } from "./paths.ts";

/**
 * 今の道の場所（試合表の画面の外は null、一覧と作るは ""、試合表の中はその ID）。
 * @returns 今の道の場所
 */
function useCurrentPlace(): string | null {
  return useRouterState({
    select: (state) => {
      const leaf = state.matches.at(-1);
      if (!leaf) return null;
      const inMatch =
        leaf.routeId === MATCH_ROUTE_PATTERNS.list ||
        leaf.routeId.startsWith(`${MATCH_ROUTE_PATTERNS.list}/`);
      if (!inMatch) return null;
      const inTable =
        leaf.routeId === MATCH_TABLE_SCOPE || leaf.routeId.startsWith(`${MATCH_TABLE_SCOPE}/`);
      if (!inTable) return "";
      const { tableId } = leaf.params as { tableId?: string };
      return tableId ?? "";
    },
  });
}

/**
 * 外枠のナビに出す試合表の項目。
 * @returns ナビの項目（並びの順）
 */
export function useMatchNavItems(): readonly NavItem[] {
  const tableId = useCurrentPlace();
  if (tableId === null) return [];
  const list: NavItem = {
    id: "match-list",
    label: "試合表の一覧",
    to: matchPaths.list(),
    icon: "list",
    also: [matchPaths.create()],
  };
  if (!tableId) return [list];
  return [
    list,
    { id: "match-roster", label: "名簿と設定", to: matchPaths.roster(tableId), icon: "people" },
    { id: "match-board", label: "試合表", to: matchPaths.board(tableId), icon: "drafts" },
    { id: "match-print", label: "印刷", to: matchPaths.print(tableId), icon: "pen" },
    {
      id: "match-view-link",
      label: "見るだけのページ",
      to: matchPaths.viewLink(tableId),
      icon: "globe",
    },
    { id: "match-join", label: "QR で受け付ける", to: matchPaths.joinAdmin(tableId), icon: "at" },
  ];
}
