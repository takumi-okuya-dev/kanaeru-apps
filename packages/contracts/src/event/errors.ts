// 交流会（event）の領域のエラーの code と文言（zod を読まない。画面が文言だけを読んでも zod を束に入れないため）。
// 403・404 の code は土台と同じ（FORBIDDEN・NOT_FOUND）で、文言だけを交流会に合わせる（research R2）。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか。トークンなどの作り手の言葉を出さない）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const EVENT_ERRORS = {
  /** その交流会で、主催者でも受付係でもない（外された受付係を含む。reception・survey も使う） */
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "この交流会の管理の画面は使えません。主催者に確かめてください。",
  },
  /** 交流会がない・ID の形が違う */
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    message: "この交流会は見つかりません。URL が違うか、消された可能性があります。",
  },
  /** 招待の印の形が違う・知らない・作り直された */
  STAFF_INVITE_INVALID: {
    code: "STAFF_INVITE_INVALID",
    status: 404,
    message: "この招待のリンクは使えません。主催者に新しいリンクをもらってください。",
  },
  /** 交流会の日（日本時間）が終わった */
  STAFF_INVITE_EXPIRED: {
    code: "STAFF_INVITE_EXPIRED",
    status: 410,
    message:
      "この招待のリンクは使えません。交流会の日が終わりました。主催者に新しいリンクをもらってください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type EventErrorKey = keyof typeof EVENT_ERRORS;
