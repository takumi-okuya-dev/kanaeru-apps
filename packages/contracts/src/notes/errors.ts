// メモの領域のエラーの code と文言。
// 文言は EXPERIENCE.md 2 の言葉づかい（何が起きたか・なぜか・どうすればよいか）。入れた値は入れない。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const NOTES_ERRORS = {
  NOTE_TITLE_TAKEN: {
    code: "NOTE_TITLE_TAKEN",
    status: 409,
    message: "同じ題のメモがあります。ほかの題にしてください。",
  },
} as const;

/** 領域のエラーの code。 */
export type NotesErrorCode = keyof typeof NOTES_ERRORS;
