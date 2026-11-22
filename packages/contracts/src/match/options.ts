// 試合表（match）の選択肢：レベル（PRD 試合表アプリ 3章のことば。match-001 research R4）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/**
 * レベルの code（並びは上から。Google フォームの「1上級」〜「4入門」の数字の順。index がレベルの段で、差が「何段離れているか」）。
 */
export const MATCH_LEVELS = ["advanced", "intermediate", "beginner", "novice"] as const;

/** レベル。 */
export type MatchLevel = (typeof MATCH_LEVELS)[number];

/** レベルの画面の言葉。 */
export const MATCH_LEVEL_LABELS = {
  advanced: "上級",
  intermediate: "中級",
  beginner: "初級",
  novice: "入門",
} as const satisfies Record<MatchLevel, string>;
