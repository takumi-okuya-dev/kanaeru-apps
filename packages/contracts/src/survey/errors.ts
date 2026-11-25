// アンケート（survey）の領域のエラーの code と文言（zod を読まない）。
// 交流会がない・権限がないは event の EVENT_ERRORS（NOT_FOUND・FORBIDDEN）、チェックインがないは reception の
// RECEPTION_ERRORS.CHECKIN_NOT_FOUND を使う。文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const SURVEY_ERRORS = {
  /** アンケートが閉じている（参加者自身の回答だけを断る。AD-13） */
  SURVEY_CLOSED: {
    code: "SURVEY_CLOSED",
    status: 409,
    message: "アンケートは閉じています。主催者がアンケートを開いている間だけ答えられます。",
  },
  /** その交流会にチェックインしていない */
  SURVEY_NOT_CHECKED_IN: {
    code: "SURVEY_NOT_CHECKED_IN",
    status: 403,
    message: "先にチェックインしてください。チェックインの画面でチェックインすると答えられます。",
  },
} as const;

/** 領域のエラーのキー。 */
export type SurveyErrorKey = keyof typeof SURVEY_ERRORS;
