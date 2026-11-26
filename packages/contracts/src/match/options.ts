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

/** レベルの分け方の code（FR-M6。前の形の設定の grouping と、組の決まり MATCH_GROUPS の key。none は分けない）。 */
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

/**
 * レベル別の分け方の code（設定の levels。分けない〈none〉は分け方の ungrouped で選ぶ。match-009）。
 */
export const MATCH_LEVEL_GROUPINGS = ["four", "three", "two"] as const;

/** レベル別の分け方。 */
export type MatchLevelGrouping = (typeof MATCH_LEVEL_GROUPINGS)[number];

/**
 * 分け方の code（レベル別・分けない・ミニゲーム。組み合わせて選ぶ。試合表の画面の「分け方」のタブの順。match-009）。
 */
export const MATCH_SETS = ["levels", "ungrouped", "mini"] as const;

/** 分け方。 */
export type MatchSet = (typeof MATCH_SETS)[number];

/** 分け方の画面の言葉。 */
export const MATCH_SET_LABELS = {
  levels: "レベル別",
  ungrouped: "分けない",
  mini: "ミニゲーム",
} as const satisfies Record<MatchSet, string>;

/** ミニゲームのコート数の上限（チームはコート数×2。match-009）。 */
export const MINI_COURTS_MAX = 20;

/** ミニゲームのチーム分けで均すレベルの点（上級4・中級3・初級2・入門1。match-009 research R4）。 */
export const LEVEL_POINTS = {
  advanced: 4,
  intermediate: 3,
  beginner: 2,
  novice: 1,
} as const satisfies Record<MatchLevel, number>;

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

/**
 * 設定から、今の組の並びを決める（レベル別の組 +〈分けないなら〉全員の組 all。組の key は分け方をまたいで重ならない。
 * match-009 research R2）。
 * @param settings 設定のうち、レベル別の分け方（levels）と分けないか（ungrouped）
 * @param settings.levels レベル別の分け方（null はレベル別をしない）
 * @param settings.ungrouped 分けない（全員で1つ）もするか
 * @returns 組（レベル別の組を上のレベルから、そのあとに all）
 */
export function matchGroupsOf(settings: {
  levels: MatchLevelGrouping | null;
  ungrouped: boolean;
}): readonly MatchGroup[] {
  return [
    ...(settings.levels ? MATCH_GROUPS[settings.levels] : []),
    ...(settings.ungrouped ? MATCH_GROUPS.none : []),
  ];
}

/**
 * 前の形の分け方1つ（4つ・3つ・2つ・分けない）を、新しい設定のレベル別の分け方と分けないかにする（前の形の設定を直すとき・試験）。
 * @param grouping 前の形の分け方
 * @returns レベル別の分け方と、分けないか
 */
export function settingsOfGrouping(grouping: MatchGrouping): {
  levels: MatchLevelGrouping | null;
  ungrouped: boolean;
} {
  return grouping === "none"
    ? { levels: null, ungrouped: true }
    : { levels: grouping, ungrouped: false };
}

/**
 * 組の key が属する分け方（all は分けない、ほかはレベル別）。
 * @param key 組の key
 * @returns 分け方
 */
export function groupSetOf(key: MatchGroupKey): "levels" | "ungrouped" {
  return key === "all" ? "ungrouped" : "levels";
}

/** 分けないときの、1試合の中のレベルの差の上限（段。PRD FR-M6【仮決め】）。 */
export const UNGROUPED_MAX_LEVEL_SPREAD = 2;

/**
 * 当日の印の code（来る・遅れて来る・来ない・帰った。FR-M3・FR-M14）。試合に入るのは present だけ。
 * left（帰った）は当日に「帰る」を付けた人（match-003。終わった試合には名前が残り、これからの試合には入らない）。
 */
export const PLAYER_STATUSES = ["present", "late", "absent", "left"] as const;

/** 当日の印。 */
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** 当日の印の画面の言葉。 */
export const PLAYER_STATUS_LABELS = {
  present: "来る",
  late: "遅れて来る",
  absent: "来ない",
  left: "帰った",
} as const satisfies Record<PlayerStatus, string>;
