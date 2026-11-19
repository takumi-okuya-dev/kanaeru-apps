// アンケート（survey）の選択肢：月いくら・テスター・仕事の立場・職種（PRD FR-10・決定 A6・A15。research R2）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// 答えていない・「答えない」は、API と DB では null。zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/** 月いくらの code（並びは画面の順）。 */
export const MONTHLY_PRICES = ["jpy0", "jpy500", "jpy1000", "jpy3000plus", "unknown"] as const;

/** 実現したら月いくらなら使うか。 */
export type MonthlyPrice = (typeof MONTHLY_PRICES)[number];

/** 月いくらの画面の言葉。 */
export const MONTHLY_PRICE_LABELS = {
  jpy0: "0円",
  jpy500: "500円",
  jpy1000: "1,000円",
  jpy3000plus: "3,000円以上",
  unknown: "分からない",
} as const satisfies Record<MonthlyPrice, string>;

/** 「月いくらの高い順」の並び（答えていない人は、この後ろ。research R7）。 */
export const MONTHLY_PRICES_HIGH_FIRST = [
  "jpy3000plus",
  "jpy1000",
  "jpy500",
  "jpy0",
  "unknown",
] as const satisfies readonly MonthlyPrice[];

/** テスターになるかの code。 */
export const TESTER_ANSWERS = ["yes", "no"] as const;

/** テスターになるか。 */
export type TesterAnswer = (typeof TESTER_ANSWERS)[number];

/** テスターになるかの画面の言葉。 */
export const TESTER_ANSWER_LABELS = {
  yes: "はい",
  no: "いいえ",
} as const satisfies Record<TesterAnswer, string>;

/** 仕事の立場の code（並びは画面の順）。 */
export const JOB_ROLES = [
  "executive",
  "manager",
  "employee",
  "freelance",
  "student",
  "other",
] as const;

/** 仕事の立場。 */
export type JobRole = (typeof JOB_ROLES)[number];

/** 仕事の立場の画面の言葉。 */
export const JOB_ROLE_LABELS = {
  executive: "経営者",
  manager: "管理職",
  employee: "会社員",
  freelance: "フリーランス",
  student: "学生",
  other: "その他",
} as const satisfies Record<JobRole, string>;

/** 職種の code（並びは画面の順）。 */
export const JOB_TYPES = [
  "engineer",
  "designer",
  "sales",
  "marketing",
  "planning",
  "backoffice",
  "management",
  "other",
] as const;

/** 職種。 */
export type JobType = (typeof JOB_TYPES)[number];

/** 職種の画面の言葉。 */
export const JOB_TYPE_LABELS = {
  engineer: "エンジニア",
  designer: "デザイナー",
  sales: "営業",
  marketing: "マーケティング",
  planning: "企画・PM",
  backoffice: "事務・管理部門（人事・経理・総務など）",
  management: "経営",
  other: "その他",
} as const satisfies Record<JobType, string>;

/** 任意の設問の「答えない」の言葉（API と DB では null）。 */
export const NOT_ANSWERED_LABEL = "答えない";

/**
 * 選択肢の言葉を引く（答えていない・「答えない」の null は空。一覧の表とカード・CSV に使う）。
 * @param labels code から言葉
 * @param value code か null
 * @returns 言葉か空
 */
export function choiceLabel<K extends string>(labels: Record<K, string>, value: K | null): string {
  return value === null ? "" : labels[value];
}

/** 設問の名前（画面の見出し・一覧と CSV の見出しに使う）。 */
export const SURVEY_QUESTION_LABELS = {
  concern: "困りごと",
  monthlyPrice: "実現したら月いくらなら使うか",
  tester: "テスターになる",
  jobRole: "仕事の立場",
  jobType: "職種",
} as const;

/** 一覧の短い見出し（表と CSV）。 */
export const SURVEY_COLUMN_LABELS = {
  concern: "困りごと",
  monthlyPrice: "月いくら",
  tester: "テスター",
  jobRole: "仕事の立場",
  jobType: "職種",
} as const;

/** 一覧の並べ方の code（newest：回答の新しい順・price：月いくらの高い順）。 */
export const SURVEY_SORTS = ["newest", "price"] as const;

/** 一覧の並べ方。 */
export type SurveySort = (typeof SURVEY_SORTS)[number];

/**
 * 月いくらの高い順の比べ方（高いほうが前。「分からない」の次に答えていない人。sort の比べる関数に使う）。
 * @param a 1つ目の答え（なければ null）
 * @param b 2つ目の答え（なければ null）
 * @returns a が前なら負・b が前なら正・同じなら 0
 */
export function compareByMonthlyPrice(a: MonthlyPrice | null, b: MonthlyPrice | null): number {
  const rank = (value: MonthlyPrice | null) =>
    value === null ? MONTHLY_PRICES_HIGH_FIRST.length : MONTHLY_PRICES_HIGH_FIRST.indexOf(value);
  return rank(a) - rank(b);
}
