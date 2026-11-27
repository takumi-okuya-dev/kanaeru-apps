// 人物メモの画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-31）。道の文字は、ここ1か所で持つ。
// メモの値（検索の言葉・タグ・名前）は道に載せない（AD-31）。

/** 道の形（TanStack Router の道の ID）。 */
export const PERSON_ROUTE_PATTERNS = {
  /** 人の一覧 */
  list: "/person",
} as const;
