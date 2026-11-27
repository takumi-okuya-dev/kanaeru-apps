// 人物メモの画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-31）。道の文字は、ここ1か所で持つ。
// メモの値（検索の言葉・タグ・名前）は道に載せない（AD-31）。道に載せるのは人と会った場の ID だけ（research R12）。

/** 道の形（TanStack Router の道の ID）。 */
export const PERSON_ROUTE_PATTERNS = {
  /** 人の一覧と検索 */
  list: "/person",
  /** 人を足す */
  create: "/person/new",
  /** 人のメモ */
  note: "/person/notes/$noteId",
  /** 会った場の一覧 */
  meetings: "/person/meetings",
  /** 会った場（続けて足す） */
  meeting: "/person/meetings/$meetingId",
} as const;
