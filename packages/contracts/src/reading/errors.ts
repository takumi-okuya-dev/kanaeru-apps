// 読書記録（reading）の領域のエラーの code と文言（zod を読まない）。
// 文言に利用者の値（書名・マーカーの文・コメント・検索の言葉）と、外の API の URL を入れない（PRD 5章）。
// ほかの人の記録は、あると知らせず NOT_FOUND にする（AD-32）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const READING_ERRORS = {
  /** 本・マーカーがない（消した・ID が違う・ほかの使う人のもの） */
  NOT_FOUND: {
    code: "READING_NOT_FOUND",
    status: 404,
    message:
      "本かマーカーが見つかりません。消したか、リンクが違うかもしれません。本棚から開き直してください。",
  },
  /** 書誌の検索の相手が止まっている・遅い・答えの形が違う（AD-33） */
  CATALOG_UNAVAILABLE: {
    code: "READING_CATALOG_UNAVAILABLE",
    status: 502,
    message: "今は本を探せません。少し待ってもう一度探すか、書名と著者を手で書いてください。",
  },
  /** 同じ本どうしをまとめようとした */
  SAME_BOOK: {
    code: "READING_SAME_BOOK",
    status: 422,
    message: "同じ本にはまとめられません。まとめる先に、ほかの本を選んでください。",
  },
} as const;
