// アカウント（account）の領域のエラーの code と文言（zod を読まない。画面が文言だけを読んでも zod を束に入れないため）。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか。トークン・セッションなどの作り手の言葉を出さない）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const ACCOUNT_ERRORS = {
  /** ログインしていない・セッションが切れた（どの領域の窓口でも同じ。AD-12） */
  UNAUTHENTICATED: {
    code: "UNAUTHENTICATED",
    status: 401,
    message: "ログインしていません。LINEでログインし直してください。",
  },
  /** LINE の ID トークンを確かめられなかった（期限切れ・別のチャネル・形が違う） */
  LINE_LOGIN_FAILED: {
    code: "LINE_LOGIN_FAILED",
    status: 401,
    message: "LINEのログインを確かめられませんでした。LINEで開き直してください。",
  },
  /** LINE に届かない（時間切れ・LINE の障害） */
  LINE_UNREACHABLE: {
    code: "LINE_UNREACHABLE",
    status: 502,
    message: "LINEにつながりませんでした。電波の良い所で、もう一度試してください。",
  },
  /** ほかの人が書きこむ記録を持っているので、退会できない（先に記録を消すか渡す。AD-19） */
  ACCOUNT_OWNS_SHARED_RECORDS: {
    code: "ACCOUNT_OWNS_SHARED_RECORDS",
    status: 409,
    message:
      "ほかの人も使っている記録があるため、退会できません。先にその記録を消すか、ほかの人に渡してから、もう一度お試しください。",
  },
} as const;

/** 領域のエラーの code。 */
export type AccountErrorCode = keyof typeof ACCOUNT_ERRORS;
