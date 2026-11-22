// 試合表（match）の選択肢：レベル（PRD 試合表アプリ 3章のことば。match-001 research R4）・試合の形・レベルの分け方と組・当日の印
// （match-002 research）。
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

/** 試合の形の code（ダブルス・シングルス。試合表ごとに1つ。FR-M10）。 */
export const MATCH_FORMATS = ["doubles", "singles"] as const;

/** 試合の形。 */
export type MatchFormat = (typeof MATCH_FORMATS)[number];

/** 試合の形の画面の言葉。 */
export const MATCH_FORMAT_LABELS = {
  doubles: "ダブルス",
  singles: "シングルス",
} as const satisfies Record<MatchFormat, string>;

/** 1試合に入る人数（ダブルスは4人・シングルスは2人。ペアは決めない。FR-M9）。 */
export const PLAYERS_PER_GAME = {
  doubles: 4,
  singles: 2,
} as const satisfies Record<MatchFormat, number>;

/** レベルの分け方の code（FR-M6。既定は four）。 */
export const MATCH_GROUPINGS = ["four", "three", "two", "none"] as const;

/** レベルの分け方。 */
export type MatchGrouping = (typeof MATCH_GROUPINGS)[number];

/** レベルの分け方の画面の言葉。 */
export const MATCH_GROUPING_LABELS = {
  four: "上級・中級・初級・入門",
  three: "上級・中級・初級＆入門",
  two: "上級＆中級・初級＆入門",
  none: "分けない（全員で1つ・レベルの差をならす）",
} as const satisfies Record<MatchGrouping, string>;

/** 組の key（レベルの分け方で分けた1つの組。試合表の中身の組み合わせの key）。 */
export const MATCH_GROUP_KEYS = [
  "advanced",
  "intermediate",
  "beginner",
  "novice",
  "beginner_novice",
  "advanced_intermediate",
  "all",
] as const;

/** 組の key。 */
export type MatchGroupKey = (typeof MATCH_GROUP_KEYS)[number];

/** 組（key・画面の言葉・入るレベル）。 */
export type MatchGroup = {
  /** 組の key */
  key: MatchGroupKey;
  /** 画面の言葉（タブ・印刷の題） */
  label: string;
  /** 入るレベル */
  levels: readonly MatchLevel[];
};

/** レベルの分け方ごとの組（並びは上のレベルから）。 */
export const MATCH_GROUPS = {
  four: [
    { key: "advanced", label: "上級", levels: ["advanced"] },
    { key: "intermediate", label: "中級", levels: ["intermediate"] },
    { key: "beginner", label: "初級", levels: ["beginner"] },
    { key: "novice", label: "入門", levels: ["novice"] },
  ],
  three: [
    { key: "advanced", label: "上級", levels: ["advanced"] },
    { key: "intermediate", label: "中級", levels: ["intermediate"] },
    { key: "beginner_novice", label: "初級＆入門", levels: ["beginner", "novice"] },
  ],
  two: [
    { key: "advanced_intermediate", label: "上級＆中級", levels: ["advanced", "intermediate"] },
    { key: "beginner_novice", label: "初級＆入門", levels: ["beginner", "novice"] },
  ],
  none: [{ key: "all", label: "全員", levels: ["advanced", "intermediate", "beginner", "novice"] }],
} as const satisfies Record<MatchGrouping, readonly MatchGroup[]>;

/** 分けないときの、1試合の中のレベルの差の上限（段。PRD FR-M6【仮決め】）。 */
export const UNGROUPED_MAX_LEVEL_SPREAD = 2;

/** 当日の印の code（来る・遅れて来る・来ない。FR-M3。帰るは当日の組み直しの段で足す）。 */
export const PLAYER_STATUSES = ["present", "late", "absent"] as const;

/** 当日の印。 */
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** 当日の印の画面の言葉。 */
export const PLAYER_STATUS_LABELS = {
  present: "来る",
  late: "遅れて来る",
  absent: "来ない",
} as const satisfies Record<PlayerStatus, string>;
