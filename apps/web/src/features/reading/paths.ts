// 読書記録の画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-32）。道の文字は、ここ1か所で持つ。
// マーカーの文・コメント・検索の言葉は道に載せない（PRD 5章）。

/** 道の形（TanStack Router の道の ID）。 */
export const READING_ROUTE_PATTERNS = {
  /** 本棚 */
  shelf: "/reading",
} as const;
