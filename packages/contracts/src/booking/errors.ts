// 予約（booking）の領域のエラーの code と文言（zod を読まない）。
// 交流会がない・権限がないは event の EVENT_ERRORS（NOT_FOUND・FORBIDDEN）を使う。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・なぜか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const BOOKING_ERRORS = {
  /** 使い方が「受付だけ」の交流会で、名簿の窓口を呼んだ（research R1） */
  ROSTER_OFF: {
    code: "BOOKING_ROSTER_OFF",
    status: 409,
    message:
      "この交流会は名簿を使っていません。準備の画面の「使い方」で「名簿を使う」を選んでから、もう一度開いてください。",
  },
  /** 名簿の行がない（ほかの端末で消された・まとめられた・別の交流会の ID） */
  ENTRY_NOT_FOUND: {
    code: "BOOKING_ENTRY_NOT_FOUND",
    status: 404,
    message:
      "名簿の行が見つかりません。ほかの端末でまとめられたかもしれません。画面を読み直してください。",
  },
  /** チェックインがない（取り消された・別の交流会の ID） */
  CHECKIN_NOT_FOUND: {
    code: "BOOKING_CHECKIN_NOT_FOUND",
    status: 404,
    message: "チェックインが見つかりません。取り消されたかもしれません。画面を読み直してください。",
  },
  /** 当てられない行（取り消し・もう当たっている） */
  ENTRY_NOT_MATCHABLE: {
    code: "BOOKING_ENTRY_NOT_MATCHABLE",
    status: 409,
    message:
      "この行には当てられません。取り消しの行か、もうほかのチェックインに当たっています。画面を読み直してください。",
  },
  /** チェックインがもう名簿に当たっている */
  CHECKIN_ALREADY_MATCHED: {
    code: "BOOKING_CHECKIN_ALREADY_MATCHED",
    status: 409,
    message: "このチェックインは、もう名簿に当たっています。画面を読み直してください。",
  },
  /** 外そうとした当てが、手で当てたものでない（同じアカウントの自動の当て・当たっていない） */
  MATCH_NOT_MANUAL: {
    code: "BOOKING_MATCH_NOT_MANUAL",
    status: 409,
    message:
      "この行は手で当てたものではないので外せません。同じ LINE のアカウントで自動で当たったときは、チェックインを取り消してください。",
  },
  /** 名前の違う行をまとめようとした（research R7） */
  MERGE_NAME_MISMATCH: {
    code: "BOOKING_MERGE_NAME_MISMATCH",
    status: 400,
    message: "まとめられるのは、同じ名前の2つの行だけです。画面を読み直して、選び直してください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type BookingErrorKey = keyof typeof BOOKING_ERRORS;
