// 外枠のナビに出す Threads の運用の項目。
// - Threads の画面の外：何も出さない（外枠は今のアプリの領域の項目だけを出す。アプリの入口は切り替えとすべてのアプリ）
// - Threads の画面（/threads…）：「アカウント」。運用アカウントの中では「投稿の案」「案を作る」「戦略」「リサーチ」「反応」「分析」「外部メディア」「設定」も出す
import { useRouterState } from "@tanstack/react-router";
import type { NavItem } from "../../lib/feature.ts";
import { THREADS_ACCOUNT_SCOPE, THREADS_ROUTE_PATTERNS, threadsPaths } from "./paths.ts";

/**
 * 今の道の場所（Threads の画面の外は null、一覧は ""、運用アカウントの中はその ID）。
 * 選んだ値は文字か null にして、道が変わっても同じ値なら描き直さない。
 * @returns 今の道の場所
 */
function useCurrentPlace(): string | null {
  return useRouterState({
    select: (state) => {
      const leaf = state.matches.at(-1);
      if (!leaf) return null;
      const inThreads =
        leaf.routeId === THREADS_ROUTE_PATTERNS.accounts ||
        leaf.routeId.startsWith(`${THREADS_ROUTE_PATTERNS.accounts}/`);
      if (!inThreads) return null;
      if (!leaf.routeId.startsWith(`${THREADS_ACCOUNT_SCOPE}/`)) return "";
      const { accountId } = leaf.params as { accountId?: string };
      return accountId ?? "";
    },
  });
}

/**
 * 外枠のナビに出す Threads の運用の項目。
 * @returns ナビの項目（並びの順）
 */
export function useThreadsNavItems(): readonly NavItem[] {
  const accountId = useCurrentPlace();
  if (accountId === null) return [];
  const list: NavItem = {
    id: "threads-accounts",
    label: "アカウント",
    to: threadsPaths.accounts(),
    icon: "people",
  };
  if (!accountId) return [list];
  return [
    list,
    { id: "threads-stock", label: "投稿の案", to: threadsPaths.stock(accountId), icon: "list" },
    {
      id: "threads-create",
      label: "案を作る",
      to: threadsPaths.create(accountId),
      icon: "concerns",
    },
    { id: "threads-strategy", label: "戦略", to: threadsPaths.strategy(accountId), icon: "setup" },
    {
      id: "threads-research",
      label: "リサーチ",
      to: threadsPaths.research(accountId),
      icon: "concerns",
    },
    {
      id: "threads-performance",
      label: "反応",
      to: threadsPaths.performance(accountId),
      icon: "list",
    },
    {
      id: "threads-analysis",
      label: "分析",
      to: threadsPaths.analysis(accountId),
      icon: "list",
    },
    {
      id: "threads-media",
      label: "外部メディア",
      to: threadsPaths.media(accountId),
      icon: "list",
    },
    { id: "threads-settings", label: "設定", to: threadsPaths.settings(accountId), icon: "setup" },
  ];
}
