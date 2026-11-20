// 外枠のナビに出す Threads の運用の項目。
// - Threads の画面の外：何も出さない（外枠は今のアプリの領域の項目だけを出す。アプリの入口は切り替えとすべてのアプリ）
// - Threads の画面（/threads…）：「アカウント」。運用アカウントの中では「ホーム」（threads-012）「投稿の案」「案を作る」「戦略」「リサーチ」「反応」「分析」「外部メディア」「設定」も出す
// - 「投稿の案」には承認待ちの数を添える（threads-011。画面が読んだ運用アカウントの数を使い、ナビのために問い合わせを始めない）
// - 「組織」は、どれかの組織に入っている人にだけ出す（threads-013。画面が読んだ入っている組織を使い、ナビのために問い合わせを始めない）
import type { ThreadsAccount, ThreadsOrganizationList } from "@workspace/contracts/threads";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { NavItem } from "../../lib/feature.ts";
import { THREADS_ACCOUNT_SCOPE, THREADS_ROUTE_PATTERNS, threadsPaths } from "./paths.ts";
import { fetchAccount, fetchTeamOrganizations } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/**
 * 画面が読んだ運用アカウントの、承認待ちの案の数（まだ読んでいなければ undefined。ここからは読みに行かない）。
 * @param accountId 運用アカウントの ID（運用アカウントの外は ""）
 * @returns 承認待ちの数
 */
function useNeedsReviewCount(accountId: string): number | undefined {
  const { data } = useQuery<ThreadsAccount>({
    queryKey: THREADS_QUERY_KEYS.detail(accountId),
    // 画面と同じ読みこむ処理を持たせ、自分からは読みに行かない（enabled: false）。読みこむ処理を持たない問い合わせは、
    // 読み直しのたびにエラーになり、skipToken は同じ鍵の画面の読み直しまで止めてしまう（交流会のナビと同じ形）
    queryFn: () => fetchAccount(accountId),
    enabled: false,
  });
  return accountId ? data?.counts.needsReview : undefined;
}

/**
 * 画面が読んだ入っている組織があるか（まだ読んでいなければ false。ここからは読みに行かない）。
 * @returns 1つ以上入っていれば true
 */
function useInOrganization(): boolean {
  const { data } = useQuery<ThreadsOrganizationList>({
    queryKey: THREADS_QUERY_KEYS.organizations,
    queryFn: fetchTeamOrganizations,
    enabled: false,
  });
  return (data?.organizations.length ?? 0) > 0;
}

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
        leaf.routeId === THREADS_ROUTE_PATTERNS.landing ||
        leaf.routeId.startsWith(`${THREADS_ROUTE_PATTERNS.landing}/`);
      if (!inThreads) return null;
      const inAccount =
        leaf.routeId === THREADS_ACCOUNT_SCOPE ||
        leaf.routeId.startsWith(`${THREADS_ACCOUNT_SCOPE}/`);
      if (!inAccount) return "";
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
  const needsReview = useNeedsReviewCount(accountId ?? "");
  const inOrganization = useInOrganization();
  if (accountId === null) return [];
  const list: NavItem = {
    id: "threads-accounts",
    label: "アカウント",
    to: threadsPaths.accounts(),
    icon: "people",
  };
  const organizations: NavItem[] = inOrganization
    ? [
        {
          id: "threads-organizations",
          label: "組織",
          to: threadsPaths.organizations(),
          icon: "people",
        },
      ]
    : [];
  if (!accountId) return [list, ...organizations];
  return [
    list,
    ...organizations,
    { id: "threads-home", label: "ホーム", to: threadsPaths.home(accountId), icon: "account" },
    {
      id: "threads-stock",
      label: needsReview ? `投稿の案（${needsReview}）` : "投稿の案",
      to: threadsPaths.stock(accountId),
      icon: "list",
    },
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
