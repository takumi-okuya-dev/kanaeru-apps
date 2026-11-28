// 人物メモ（person）の領域のエラーの code と文言（zod を読まない）。
// 文言に利用者の値（名前・話したこと・探す言葉・タグ）を入れない（AD-31）。ほかの人の記録は、あると知らせず NOT_FOUND にする。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const PERSON_ERRORS = {
  /** 人・会った場がない（消した・ID が違う・ほかの使う人のもの。AD-31） */
  NOT_FOUND: {
    code: "PERSON_NOT_FOUND",
    status: 404,
    message:
      "メモが見つかりません。消したか、リンクが違うかもしれません。一覧から開き直してください。",
  },
  /** もとにした版が今の版と違う（ほかの画面で先に直された。research R7） */
  VERSION_CONFLICT: {
    code: "PERSON_VERSION_CONFLICT",
    status: 409,
    message: "ほかで直されました。読み直してください。",
  },
} as const;
