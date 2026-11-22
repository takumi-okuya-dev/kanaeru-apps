// 試合表の運営の画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-25）。道の文字は、ここ1か所で持つ。
// 試合表の道（/match・/match/…）は、組み立てが LIFF を始めない（AD-4 の例外。core-013）ので、この道の画面は getLiff() を使わない。

/** 道の形（TanStack Router の道の ID）。 */
export const MATCH_ROUTE_PATTERNS = {
  /** 試合表の一覧 */
  list: "/match",
} as const;
