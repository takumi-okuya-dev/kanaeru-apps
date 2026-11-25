// 外枠のナビに出す試合表の項目（core-022）。
// - 試合表の画面の外：何も出さない（外枠は今のアプリの領域の項目だけを出す）
// - 試合表の画面（/match…）：「試合表の一覧」と、「名簿と設定」「試合表」「印刷」「見るだけのページ」「QR で受け付ける」を**いつも出す**。
//   試合表の中ではその試合表へ進み（画面が開いたら、直前に開いた試合表として端末に置く。last-table.ts）、
//   一覧・作るの画面では直前に開いた試合表へ進む。記録がなければ、薄く出し、押すと案内して一覧へ進む（NavItem.disabled）。
// - アイコンは項目ごとに違うものにする（core-011）
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import type { NavItem } from "../../lib/feature.ts";
import { readLastTable, writeLastTable } from "./last-table.ts";
import { MATCH_ROUTE_PATTERNS, MATCH_TABLE_SCOPE, matchPaths } from "./paths.ts";

/** 薄い項目を押したときの案内の文（一覧へ進んで、画面の上に出す）。 */
export const PICK_TABLE_MESSAGE = "先に試合表を選んでください";

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
 * 外枠のナビに出す試合表の項目（試合表の画面の中では、いつも出す。core-022）。
 * @returns ナビの項目（並びの順）
 */
export function useMatchNavItems(): readonly NavItem[] {
  const place = useCurrentPlace();
  useEffect(() => {
    // 試合表の中を開いたら、直前に開いた試合表として端末に置く（一覧から同じ試合表へ戻れるように）
    if (place) writeLastTable(place);
  }, [place]);
  if (place === null) return [];
  const list: NavItem = {
    id: "match-list",
    label: "試合表の一覧",
    to: matchPaths.list(),
    icon: "list",
    also: [matchPaths.create()],
  };
  // 試合表の中ならその試合表、一覧・作るの画面なら直前に開いた試合表（なければ薄く出す）
  const tableId = place || readLastTable();
  const entries = (
    [
      { id: "match-roster", label: "名簿と設定", icon: "people", path: matchPaths.roster },
      { id: "match-board", label: "試合表", icon: "drafts", path: matchPaths.board },
      { id: "match-print", label: "印刷", icon: "pen", path: matchPaths.print },
      {
        id: "match-view-link",
        label: "見るだけのページ",
        icon: "globe",
        path: matchPaths.viewLink,
      },
      { id: "match-join", label: "QR で受け付ける", icon: "at", path: matchPaths.joinAdmin },
    ] as const
  ).map((entry): NavItem => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    ...(tableId
      ? { to: entry.path(tableId) }
      : { to: matchPaths.list(), disabled: { message: PICK_TABLE_MESSAGE } }),
  }));
  return [list, ...entries];
}
