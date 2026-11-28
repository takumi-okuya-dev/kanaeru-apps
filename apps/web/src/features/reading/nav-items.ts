// 外枠のナビに出す読書記録の項目（アイコンは今ある list。本のアイコンを足すのは外枠の共通の変更なので、別の共通の PR で）。読書記録の画面（/reading…）の中でだけ「本棚」を出す（reading-002 で「あとで調べる」を足す）。
import { useRouterState } from "@tanstack/react-router";
import type { NavItem } from "../../lib/feature.ts";
import { READING_ROUTE_PATTERNS } from "./paths.ts";

/** 読書記録の画面の中で出す項目。 */
const READING_NAV_ITEMS: readonly NavItem[] = [
  { id: "reading-shelf", label: "本棚", to: READING_ROUTE_PATTERNS.shelf, icon: "list" },
];

/**
 * 外枠のナビに出す読書記録の項目（読書記録の画面の外は何も出さない）。
 * @returns ナビの項目（並びの順）
 */
export function useReadingNavItems(): readonly NavItem[] {
  const inReading = useRouterState({
    select: (state) => {
      const routeId = state.matches.at(-1)?.routeId;
      return (
        routeId === READING_ROUTE_PATTERNS.shelf ||
        (routeId?.startsWith(`${READING_ROUTE_PATTERNS.shelf}/`) ?? false)
      );
    },
  });
  return inReading ? READING_NAV_ITEMS : [];
}
