// Threads の運用の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "threads" で始める
// （ログインし直したときに account が読み直させる。書いたあとは、その運用アカウントの鍵をまとめて読み直す）。
import type {
  ActivityKind,
  AnalysisScope,
  Media,
  DraftListStatus,
  PerformanceTab,
} from "@workspace/contracts/threads";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  fetchAccount,
  fetchAccountHome,
  fetchActivity,
  fetchAnalysis,
  fetchClassifications,
  fetchMentionSettings,
  fetchExternalMedia,
  fetchListing,
  fetchMediaDefaults,
  fetchAccounts,
  fetchAutoPost,
  fetchConnection,
  fetchDrafts,
  fetchKeywords,
  fetchPerformance,
  fetchPromotions,
  fetchReferencePosts,
  fetchPostingSchedule,
  fetchPostingRules,
  fetchPromptSettings,
  fetchStrategy,
  fetchAccountAccess,
  fetchAccountTeam,
  fetchTeamNotices,
  fetchTeamOrganization,
  fetchTeamOrganizations,
  fetchTeamStatus,
} from "./api.ts";

/** Threads の運用の問い合わせの鍵。 */
export const THREADS_QUERY_KEYS = {
  /** すべての問い合わせ */
  all: ["threads"] as const,
  /** 運用アカウントの一覧 */
  accounts: ["threads", "accounts"] as const,
  /**
   * 1つの運用アカウントのすべての問い合わせ（書いたあとにまとめて読み直す）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  account: (accountId: string) => ["threads", "account", accountId] as const,
  /**
   * 運用アカウントの中身。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  detail: (accountId: string) => ["threads", "account", accountId, "detail"] as const,
  /**
   * ホームの材料の数（threads-012）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  home: (accountId: string) => ["threads", "account", accountId, "home"] as const,
  /**
   * 戦略。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  strategy: (accountId: string) => ["threads", "account", accountId, "strategy"] as const,
  /**
   * プロンプトの設定。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  promptSettings: (accountId: string) =>
    ["threads", "account", accountId, "prompt-settings"] as const,
  /**
   * 投稿のルールと NG ワード。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  postingRules: (accountId: string) => ["threads", "account", accountId, "posting-rules"] as const,
  /**
   * 投稿の案の一覧。
   * @param accountId 運用アカウントの ID
   * @param status 状態
   * @returns 鍵
   */
  drafts: (accountId: string, status: DraftListStatus) =>
    ["threads", "account", accountId, "drafts", status] as const,
  /**
   * Threads への接続。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  connection: (accountId: string) => ["threads", "account", accountId, "connection"] as const,
  /**
   * 投稿の設定。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  postingSchedule: (accountId: string) =>
    ["threads", "account", accountId, "posting-schedule"] as const,
  /**
   * 自動投稿の状態。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  autoPost: (accountId: string) => ["threads", "account", accountId, "auto-post"] as const,
  /**
   * 反応の画面。
   * @param accountId 運用アカウントの ID
   * @param tab 絞りこみ
   * @returns 鍵
   */
  performance: (accountId: string, tab: PerformanceTab) =>
    ["threads", "account", accountId, "performance", tab] as const,
  /**
   * 宣伝の一覧（threads-004）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  promotions: (accountId: string) => ["threads", "account", accountId, "promotions"] as const,
  /**
   * 参考の投稿の一覧。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  referencePosts: (accountId: string) =>
    ["threads", "account", accountId, "reference-posts"] as const,
  /**
   * リサーチのキーワードの一覧。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  keywords: (accountId: string) => ["threads", "account", accountId, "research-keywords"] as const,
  /**
   * 操作の記録（threads-005）。
   * @param accountId 運用アカウントの ID
   * @param kind 種類（なければすべて）
   * @returns 鍵
   */
  activity: (accountId: string, kind: ActivityKind | "all") =>
    ["threads", "account", accountId, "activity", kind] as const,
  /**
   * アルゴリズムの分析（threads-006）。
   * @param accountId 運用アカウントの ID
   * @param scope 範囲
   * @returns 鍵
   */
  analysis: (accountId: string, scope: AnalysisScope) =>
    ["threads", "account", accountId, "analysis", scope] as const,
  /**
   * 分類する・直す投稿の一覧。
   * @param accountId 運用アカウントの ID
   * @param mode まだの投稿・分類済み
   * @returns 鍵
   */
  classifications: (accountId: string, mode: "unclassified" | "classified") =>
    ["threads", "account", accountId, "classifications", mode] as const,
  /**
   * 時間差のメンションの設定（threads-007）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  mentionSettings: (accountId: string) =>
    ["threads", "account", accountId, "mention-settings"] as const,
  /**
   * 外部メディアの一覧（threads-008）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  externalMedia: (accountId: string) =>
    ["threads", "account", accountId, "external-media"] as const,
  /**
   * 宣伝×媒体の掲載文。
   * @param accountId 運用アカウントの ID
   * @param promotionId 宣伝の ID
   * @param media 媒体
   * @returns 鍵
   */
  listing: (accountId: string, promotionId: string, media: Media) =>
    ["threads", "account", accountId, "listing", promotionId, media] as const,
  /**
   * 媒体の既定値。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  mediaDefaults: (accountId: string) =>
    ["threads", "account", accountId, "media-defaults"] as const,
  /**
   * 今の利用者の、この運用アカウントでの関わり（threads-013）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  access: (accountId: string) => ["threads", "account", accountId, "access"] as const,
  /**
   * このアカウントのチーム（threads-013）。
   * @param accountId 運用アカウントの ID
   * @returns 鍵
   */
  team: (accountId: string) => ["threads", "account", accountId, "team"] as const,
  /** 入っている組織（threads-013。ナビの「組織」を出すかにも使う） */
  organizations: ["threads", "organizations"] as const,
  /**
   * Threads の組織の画面（threads-013）。
   * @param organizationId 組織の ID
   * @returns 鍵
   */
  organization: (organizationId: string) => ["threads", "organizations", organizationId] as const,
  /**
   * 運用状況（threads-013）。
   * @param organizationId 組織の ID
   * @returns 鍵
   */
  teamStatus: (organizationId: string) =>
    ["threads", "organizations", organizationId, "status"] as const,
  /** はじめの画面の知らせ（threads-013） */
  teamNotices: ["threads", "team-notices"] as const,
};

/**
 * 自分の運用アカウントの一覧を読む。
 * @returns 問い合わせ
 */
export function useThreadsAccounts() {
  return useQuery({ queryKey: THREADS_QUERY_KEYS.accounts, queryFn: fetchAccounts });
}

/**
 * 運用アカウントを読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useThreadsAccount(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.detail(accountId),
    queryFn: () => fetchAccount(accountId),
  });
}

/**
 * 運用アカウントのホームの材料の数を読む（threads-012）。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useAccountHome(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.home(accountId),
    queryFn: () => fetchAccountHome(accountId),
  });
}

/**
 * 戦略を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useStrategy(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.strategy(accountId),
    queryFn: () => fetchStrategy(accountId),
  });
}

/**
 * プロンプトの設定を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function usePromptSettings(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.promptSettings(accountId),
    queryFn: () => fetchPromptSettings(accountId),
  });
}

/**
 * 投稿のルールと NG ワードを読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function usePostingRules(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.postingRules(accountId),
    queryFn: () => fetchPostingRules(accountId),
  });
}

/**
 * 投稿の案の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @param status 状態
 * @param enabled 読むか（既定は読む）
 * @returns 問い合わせ
 */
export function useDrafts(accountId: string, status: DraftListStatus, enabled = true) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.drafts(accountId, status),
    queryFn: () => fetchDrafts(accountId, status),
    enabled,
  });
}

/**
 * 投稿済みの案を50件ずつ読む（threads-011。「もっと見る」で続きを読む）。
 * @param accountId 運用アカウントの ID
 * @param enabled 読むか（投稿済みのチップを選んでいるときだけ）
 * @returns 問い合わせ
 */
export function usePublishedDrafts(accountId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...THREADS_QUERY_KEYS.drafts(accountId, "published"), "pages"] as const,
    queryFn: ({ pageParam }) => fetchDrafts(accountId, "published", pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/**
 * Threads への接続を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useConnection(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.connection(accountId),
    queryFn: () => fetchConnection(accountId),
  });
}

/**
 * 投稿の設定を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function usePostingSchedule(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.postingSchedule(accountId),
    queryFn: () => fetchPostingSchedule(accountId),
  });
}

/**
 * 自動投稿の状態を読む（投稿は定期の仕事が進めるので、一覧の画面と同じく少しずつ読み直す）。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useAutoPost(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.autoPost(accountId),
    queryFn: () => fetchAutoPost(accountId),
    refetchInterval: 30_000,
  });
}

/**
 * 反応の画面を読む（50件ずつ。続きは fetchNextPage。threads-012）。
 * @param accountId 運用アカウントの ID
 * @param tab 絞りこみ
 * @returns 問い合わせ
 */
export function usePerformance(accountId: string, tab: PerformanceTab) {
  return useInfiniteQuery({
    queryKey: THREADS_QUERY_KEYS.performance(accountId, tab),
    queryFn: ({ pageParam }) => fetchPerformance(accountId, tab, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * 宣伝の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function usePromotions(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.promotions(accountId),
    queryFn: () => fetchPromotions(accountId),
  });
}

/**
 * 参考の投稿の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useReferencePosts(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.referencePosts(accountId),
    queryFn: () => fetchReferencePosts(accountId),
  });
}

/**
 * リサーチのキーワードの一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useKeywords(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.keywords(accountId),
    queryFn: () => fetchKeywords(accountId),
  });
}

/**
 * 操作の記録を読む。
 * @param accountId 運用アカウントの ID
 * @param kind 種類（"all" ならすべて）
 * @returns 問い合わせ
 */
export function useActivity(accountId: string, kind: ActivityKind | "all") {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.activity(accountId, kind),
    queryFn: () => fetchActivity(accountId, kind === "all" ? undefined : kind),
  });
}

/**
 * アルゴリズムの分析を読む。
 * @param accountId 運用アカウントの ID
 * @param scope 範囲
 * @returns 問い合わせ
 */
export function useAnalysis(accountId: string, scope: AnalysisScope) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.analysis(accountId, scope),
    queryFn: () => fetchAnalysis(accountId, scope),
  });
}

/**
 * 分類する・直す投稿の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @param mode まだの投稿・分類済み
 * @returns 問い合わせ
 */
export function useClassifications(accountId: string, mode: "unclassified" | "classified") {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.classifications(accountId, mode),
    queryFn: () => fetchClassifications(accountId, mode),
  });
}

/**
 * 時間差のメンションの設定を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useMentionSettings(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.mentionSettings(accountId),
    queryFn: () => fetchMentionSettings(accountId),
  });
}

/**
 * 外部メディアの一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useExternalMedia(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.externalMedia(accountId),
    queryFn: () => fetchExternalMedia(accountId),
  });
}

/**
 * 宣伝×媒体の掲載文を読む。
 * @param accountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @returns 問い合わせ
 */
export function useListing(accountId: string, promotionId: string, media: Media) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.listing(accountId, promotionId, media),
    queryFn: () => fetchListing(accountId, promotionId, media),
  });
}

/**
 * 媒体の既定値を読む。
 * @param accountId 運用アカウントの ID
 * @returns 問い合わせ
 */
export function useMediaDefaults(accountId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.mediaDefaults(accountId),
    queryFn: () => fetchMediaDefaults(accountId),
  });
}

/**
 * 今の利用者の、この運用アカウントでの関わりとできること（threads-013）。
 * @param accountId 運用アカウントの ID
 * @param enabled 読むか
 * @returns 問い合わせ
 */
export function useAccountAccess(accountId: string, enabled = true) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.access(accountId),
    queryFn: () => fetchAccountAccess(accountId),
    enabled,
  });
}

/**
 * このアカウントのチーム（threads-013）。
 * @param accountId 運用アカウントの ID
 * @param enabled 読むか
 * @returns 問い合わせ
 */
export function useAccountTeam(accountId: string, enabled = true) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.team(accountId),
    queryFn: () => fetchAccountTeam(accountId),
    enabled,
  });
}

/**
 * 入っている組織（threads-013。ナビの「組織」はこの読みこみの結果を使う）。
 * @returns 問い合わせ
 */
export function useTeamOrganizations() {
  return useQuery({ queryKey: THREADS_QUERY_KEYS.organizations, queryFn: fetchTeamOrganizations });
}

/**
 * Threads の組織の画面（threads-013）。
 * @param organizationId 組織の ID
 * @returns 問い合わせ
 */
export function useTeamOrganization(organizationId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.organization(organizationId),
    queryFn: () => fetchTeamOrganization(organizationId),
  });
}

/**
 * 運用状況（threads-013。数と日付だけ）。
 * @param organizationId 組織の ID
 * @returns 問い合わせ
 */
export function useTeamStatus(organizationId: string) {
  return useQuery({
    queryKey: THREADS_QUERY_KEYS.teamStatus(organizationId),
    queryFn: () => fetchTeamStatus(organizationId),
  });
}

/**
 * はじめの画面の知らせ（threads-013）。
 * @returns 問い合わせ
 */
export function useTeamNotices() {
  return useQuery({ queryKey: THREADS_QUERY_KEYS.teamNotices, queryFn: fetchTeamNotices });
}
