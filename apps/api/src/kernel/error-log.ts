// 予期しないエラーをログに書くときの中身。
// エラーの文は、利用者の値や SQL に渡した値を含みうる（drizzle の DrizzleQueryError は「Failed query: …\nparams: …」）。
// そのため、エラーの名前・どこで起きたか（積み重ねの at の行）・DB のエラーの SQLSTATE と制約の名前だけを出す。

/** ログに出す、予期しないエラーの中身。 */
export type UnexpectedErrorLog = {
  /** エラーの名前（Error でなければ unknown） */
  errorName: string;
  /** 積み重ねの at の行だけ（エラーの文の行は除く） */
  stack?: string;
  /** DB のエラーの SQLSTATE（5文字） */
  sqlState?: string;
  /** DB のエラーの制約の名前（表の定義が決めた名前） */
  constraint?: string;
};

/** SQLSTATE の形（英大文字と数字の5文字）。 */
const SQL_STATE = /^[0-9A-Z]{5}$/;

/** 制約の名前の形（英小文字・数字・下線。PostgreSQL の名前は63文字まで）。 */
const CONSTRAINT_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** 積み重ねの、どこで起きたかを示す行。 */
const STACK_FRAME = /^\s+at /;

/**
 * DB のエラーの手がかりを持ちうるもの（drizzle が包んだときは cause に入る）。
 * @param value 調べるもの
 * @returns code・constraint を読めるもの
 */
function asDbErrorLike(value: unknown): { code?: unknown; constraint?: unknown } | undefined {
  return typeof value === "object" && value !== null ? value : undefined;
}

/**
 * 形が合うときだけ、その文字を返す。
 * @param value 調べるもの
 * @param pattern 形
 * @returns 合えばその文字、合わなければ undefined
 */
function matching(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

/**
 * 予期しないエラーを、ログに書いてよい中身にする（エラーの文・SQL・渡した値・詳しい説明は出さない）。
 * @param error 投げられたもの
 * @returns ログに書く中身
 */
export function describeUnexpectedError(error: unknown): UnexpectedErrorLog {
  if (!(error instanceof Error)) return { errorName: "unknown" };
  const described: UnexpectedErrorLog = { errorName: error.name };
  const frames = (error.stack ?? "").split("\n").filter((line) => STACK_FRAME.test(line));
  if (frames.length > 0) described.stack = frames.join("\n");
  for (const candidate of [error, error.cause]) {
    const db = asDbErrorLike(candidate);
    const sqlState = matching(db?.code, SQL_STATE);
    if (!sqlState) continue;
    described.sqlState = sqlState;
    const constraint = matching(db?.constraint, CONSTRAINT_NAME);
    if (constraint) described.constraint = constraint;
    break;
  }
  return described;
}
