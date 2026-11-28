// 読書記録の画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-32）。道の文字は、ここ1か所で持つ。
// マーカーの文・コメント・検索の言葉は道に載せない（PRD 5章）。道に載せるのは本の ID だけ。

/** 道の形（TanStack Router の道の ID）。 */
export const READING_ROUTE_PATTERNS = {
  /** 本棚 */
  shelf: "/reading",
  /** 本を足す */
  addBook: "/reading/books/new",
  /** 本の画面 */
  book: "/reading/books/$bookId",
  /** 取りこむ（ファイルを選ぶ・貼り付ける） */
  import: "/reading/import",
  /** 確かめてから入れる */
  confirm: "/reading/import/confirm",
} as const;
