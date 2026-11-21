// Threads の運用の画面の道（新しいアプリの画面は /<key>/… の下。AD-15）。道の文字は、ここ1か所で持つ。

/** 道の形（TanStack Router の道の ID）。 */
export const THREADS_ROUTE_PATTERNS = {
  landing: "/threads",
  accounts: "/threads/accounts",
  home: "/threads/accounts/$accountId",
  stock: "/threads/accounts/$accountId/stock",
  create: "/threads/accounts/$accountId/create",
  strategy: "/threads/accounts/$accountId/strategy",
  settings: "/threads/accounts/$accountId/settings",
  performance: "/threads/accounts/$accountId/performance",
  research: "/threads/accounts/$accountId/research",
  analysis: "/threads/accounts/$accountId/analysis",
  media: "/threads/accounts/$accountId/media",
  listing: "/threads/accounts/$accountId/media/$promotionId/$media",
  oauthComplete: "/threads/oauth/complete",
  dataDeletion: "/threads/data-deletion/$code",
  tokenGuide: "/threads/guide/threads-token",
  teams: "/threads/teams",
  team: "/threads/teams/$teamId",
  sharedAccount: "/threads/teams/$teamId/accounts/$accountId",
} as const;

/**
 * 投稿の案の画面の ?tab= に入れてよい状態（約束の DRAFT_LIST_STATUSES と同じ並び。道は約束〈zod〉を読まないので、ここに書く。
 * 食い違いは nav-items.test.tsx が見張る。threads-011）。
 */
export const STOCK_TABS = [
  "needs_review",
  "approved",
  "published",
  "publish_failed",
  "rejected",
] as const;

/** 投稿の案の画面の ?tab= の型。 */
export type StockTab = (typeof STOCK_TABS)[number];

/** 運用アカウントの中の道の頭。 */
export const THREADS_ACCOUNT_SCOPE = "/threads/accounts/$accountId";

/** 値を入れた道。 */
export const threadsPaths = {
  /**
   * トークンの作り方の詳しい手順（threads-012）。
   * @returns 道
   */
  tokenGuide: () => "/threads/guide/threads-token",
  /**
   * Threads の入口（最後に開いた運用アカウントのホームか、一覧へ移る。threads-012）。
   * @returns 道
   */
  landing: () => "/threads",
  /**
   * 運用アカウントの一覧。
   * @returns 道
   */
  accounts: () => "/threads/accounts",
  /**
   * 運用アカウントのホーム（threads-012）。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  home: (accountId: string) => `/threads/accounts/${accountId}`,
  /**
   * 投稿の案。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  stock: (accountId: string) => `/threads/accounts/${accountId}/stock`,
  /**
   * 案を作る。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  create: (accountId: string) => `/threads/accounts/${accountId}/create`,
  /**
   * 戦略。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  strategy: (accountId: string) => `/threads/accounts/${accountId}/strategy`,
  /**
   * 設定。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  settings: (accountId: string) => `/threads/accounts/${accountId}/settings`,
  /**
   * 反応（threads-003）。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  performance: (accountId: string) => `/threads/accounts/${accountId}/performance`,
  /**
   * 宣伝とリサーチ（threads-004）。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  research: (accountId: string) => `/threads/accounts/${accountId}/research`,
  /**
   * アルゴリズムの分析（threads-006）。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  analysis: (accountId: string) => `/threads/accounts/${accountId}/analysis`,
  /**
   * 外部メディアの一覧（threads-008）。
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  media: (accountId: string) => `/threads/accounts/${accountId}/media`,
  /**
   * 宣伝×媒体の掲載文。
   * @param accountId 運用アカウントの ID
   * @param promotionId 宣伝の ID
   * @param media 媒体
   * @returns 道
   */
  listing: (accountId: string, promotionId: string, media: string) =>
    `/threads/accounts/${accountId}/media/${promotionId}/${media}`,
  /**
   * 見られるチーム（threads-016。ナビの「チーム」）。
   * @returns 道
   */
  teams: () => "/threads/teams",
  /**
   * Threads のチームの画面（運用アカウント・担当を決める・運用状況。threads-016）。
   * @param teamId チームの ID
   * @returns 道
   */
  team: (teamId: string) => `/threads/teams/${teamId}`,
  /**
   * 見せてもらっている運用アカウント（読むだけ。threads-013・threads-016）。
   * @param teamId チームの ID
   * @param accountId 運用アカウントの ID
   * @returns 道
   */
  sharedAccount: (teamId: string, accountId: string) =>
    `/threads/teams/${teamId}/accounts/${accountId}`,
};
