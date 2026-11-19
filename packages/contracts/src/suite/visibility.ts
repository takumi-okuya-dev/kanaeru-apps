// アプリの公開の状態（構成の決めごと AD-16）。値と画面の言葉と並び順を隣に置く（Consistency Conventions「選択肢」）。zod を読まない。

/** 公開の状態の並び（画面の順）。 */
export const APP_VISIBILITIES = ["off", "operator_only", "public"] as const;

/** 公開の状態（切・運営者だけ・公開）。 */
export type AppVisibility = (typeof APP_VISIBILITIES)[number];

/** 台帳に行がないアプリの状態（AD-16）。 */
export const DEFAULT_APP_VISIBILITY: AppVisibility = "operator_only";

/** 公開の状態の画面の言葉（台帳のチップ）。 */
export const APP_VISIBILITY_LABELS = {
  off: "切",
  operator_only: "運営者だけ",
  public: "公開",
} as const satisfies Record<AppVisibility, string>;

/** 公開の状態ごとの「今見える人」（台帳の列）。 */
export const APP_VISIBILITY_AUDIENCES = {
  off: "だれにも見えません",
  operator_only: "運営者だけ",
  public: "ログインした人すべて",
} as const satisfies Record<AppVisibility, string>;

/** 公開の状態ごとの説明（台帳の凡例）。 */
export const APP_VISIBILITY_DESCRIPTIONS = {
  off: "だれにも見せない。窓口は 404。ナビ・すべてのアプリにも出さない",
  operator_only: "運営者にだけ見せる（本番で確かめるとき）。台帳に行がないアプリはこの状態",
  public: "ログインした人すべてに見せる。参加者が外から開く画面（受付QR など）も動く",
} as const satisfies Record<AppVisibility, string>;

/** アプリを見る人（ログインの前は null）。 */
export type AppViewer = {
  /** 運営者か（設定の ORGANIZER_LINE_USER_ID の人。AD-5・AD-16） */
  isOperator: boolean;
} | null;

/**
 * その公開の状態のアプリが、見る人に見えるか（AD-16。運営者は「運営者だけ」も見える。ログインの前でも決まる）。
 * @param visibility 公開の状態
 * @param viewer 見る人（ログインの前は null）
 * @returns 見えるなら true
 */
export function isVisibleTo(visibility: AppVisibility, viewer: AppViewer): boolean {
  if (visibility === "public") return true;
  if (visibility === "operator_only") return viewer?.isOperator === true;
  return false;
}
