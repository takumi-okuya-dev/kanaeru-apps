// 受付（reception）の領域のエラーの code と文言（zod を読まない）。
// 交流会がない・権限がないは event の EVENT_ERRORS（NOT_FOUND・FORBIDDEN）を使う。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const RECEPTION_ERRORS = {
  /** チェックインがない（ほかの端末で取り消された・別の交流会の ID） */
  CHECKIN_NOT_FOUND: {
    code: "CHECKIN_NOT_FOUND",
    status: 404,
    message:
      "このチェックインは見つかりません。ほかの人が取り消した可能性があります。一覧を読み直してください。",
  },
  /** 選んだ割引が、その交流会の使っている割引でない（使うのをやめた・別の交流会の割引。reception-002 research R6） */
  DISCOUNT_UNAVAILABLE: {
    code: "DISCOUNT_UNAVAILABLE",
    status: 400,
    message: "この割引は選べなくなりました。画面を読み直して、割引を選び直してください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type ReceptionErrorKey = keyof typeof RECEPTION_ERRORS;
