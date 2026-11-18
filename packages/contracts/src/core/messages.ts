// 土台の code と、画面にそのまま出せる日本語の文言（zod を読まない。画面が文言だけを読んでも、zod を束に入れないため）。
// 文言は EXPERIENCE.md 2 の言葉づかい（何が起きたか・なぜか・どうすればよいか。使う人を責めない）に従う。

/** 土台の code と、画面にそのまま出せる日本語の文言。 */
export const CORE_ERROR_MESSAGES = {
  INVALID_INPUT: "入力に誤りがあります。欄のそばの説明を見て、直してください。",
  NOT_FOUND: "見つかりません。消されたか、URL が違う可能性があります。",
  FORBIDDEN: "この操作はできません。",
  CONFLICT: "ほかの所で変わりました。読み込み直してから、もう一度お試しください。",
  // DB に届かない（夜間 0時〜8時の停止など。構成の決めごと AD-10。文は EXPERIENCE.md の決めた言葉）
  DB_UNAVAILABLE: "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。",
  PAYLOAD_TOO_LARGE: "送った中身が大きすぎます。短くして、もう一度お試しください。",
  RATE_LIMITED: "操作が続いたため、少し止めています。時間をおいて、もう一度お試しください。",
  INTERNAL: "うまくいきませんでした。時間をおいて、もう一度お試しください。",
} as const;

/** 土台の code。 */
export type CoreErrorCode = keyof typeof CORE_ERROR_MESSAGES;
