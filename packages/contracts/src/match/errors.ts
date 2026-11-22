// 試合表（match）の領域のエラーの code と文言（zod を読まない）。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・なぜか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const MATCH_ERRORS = {
  /** 試合表がない（消された・90日を過ぎて消えた・別の ID） */
  NOT_FOUND: {
    code: "MATCH_NOT_FOUND",
    status: 404,
    message:
      "試合表が見つかりません。消されたか、試合の日から90日を過ぎて消えたかもしれません。一覧から開き直してください。",
  },
  /** 試合表を直す権限がない（持ち主でも、入れた組織の管理者・編集者でもない。AD-25） */
  FORBIDDEN: {
    code: "MATCH_FORBIDDEN",
    status: 403,
    message:
      "この試合表を開く権限がありません。持ち主か、試合表を入れた組織の管理者・編集者に頼んでください。",
  },
  /** もとにした版が今の版と違う（ほかの端末で直された。AD-28） */
  VERSION_CONFLICT: {
    code: "MATCH_VERSION_CONFLICT",
    status: 409,
    message:
      "ほかの端末で試合表が直されたため、保存できませんでした。画面を読み直してから、もう一度直してください。",
  },
  /** 担当の端末でない（担当がほかの端末に移った。AD-28） */
  NOT_EDITOR: {
    code: "MATCH_NOT_EDITOR",
    status: 409,
    message:
      "この端末は担当の端末でないため、保存できませんでした。この端末で直すときは「この端末で直す」を押してください。",
  },
  /** 入れようとした組織に、自分が入っていない */
  ORGANIZATION_NOT_FOUND: {
    code: "MATCH_ORGANIZATION_NOT_FOUND",
    status: 400,
    message: "選んだ組織に入っていません。入っている組織を選び直してください。",
  },
} as const;
