// 予期しないエラーをログに書くときの中身。
// エラーの文は、利用者の値や SQL に渡した値を含みうる（drizzle の DrizzleQueryError は「Failed query: …\nparams: …」）。
// そのため、エラーの名前・どこで起きたか（積み重ねの at の行）・DB のエラーの SQLSTATE と、
// 表の定義が決めた名前（制約・表・PostgreSQL の中の処理）だけを出す。
import pg from "pg";

/** ログに出す、予期しないエラーの中身。 */
export type UnexpectedErrorLog = {
  /** エラーの名前（Error でなければ unknown） */
  errorName: string;
  /** 積み重ねの at の行だけ（エラーの文は除く） */
  stack?: string;
  /** DB のエラーの SQLSTATE（5文字） */
  sqlState?: string;
  /** DB のエラーの制約の名前 */
  constraint?: string;
  /** DB のエラーの表の名前 */
  table?: string;
  /** DB のエラーを出した PostgreSQL の中の処理の名前 */
  routine?: string;
};

/** SQLSTATE の形（英大文字と数字の5文字）。 */
const SQL_STATE = /^[0-9A-Z]{5}$/;

/** 表の定義が決めた名前の形（英小文字・数字・下線。PostgreSQL の名前は63文字まで）。 */
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/** PostgreSQL の中の処理の名前の形（C の関数名。大文字を含む。例 ri_ReportViolation）。 */
const ROUTINE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** 積み重ねの、どこで起きたかを示す行。 */
const STACK_FRAME = /^\s+at /;

/** cause をたどる深さの上限（kernel/pg-errors.ts と同じ）。 */
const MAX_CAUSE_DEPTH = 5;

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
 * 積み重ねから、エラーの文を除いた at の行だけを取り出す。
 * 積み重ねの頭は「名前: 文」（文は何行にもなりうる）なので、先にその分を切り落としてから at の行を選ぶ
 * （利用者の値に「改行・空白・at 」があっても、at の行に混ざらないように）。頭の形が違えば出さない。
 * @param error エラー
 * @returns at の行（なければ undefined）
 */
function stackFrames(error: Error): string | undefined {
  const stack = error.stack ?? "";
  const head = String(error);
  if (!stack.startsWith(head)) return undefined;
  const frames = stack
    .slice(head.length)
    .split("\n")
    .filter((line) => STACK_FRAME.test(line));
  return frames.length > 0 ? frames.join("\n") : undefined;
}

/**
 * 投げられたものと、その cause の鎖（上限つき）から、最初の PostgreSQL のエラーを探す。
 * @param error 投げられたもの
 * @returns PostgreSQL のエラー（なければ undefined）
 */
function findDatabaseError(error: unknown): pg.DatabaseError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (current instanceof pg.DatabaseError) return current;
    current = current.cause;
  }
  return undefined;
}

/**
 * 予期しないエラーを、ログに書いてよい中身にする（エラーの文・SQL・渡した値・詳しい説明は出さない）。
 * @param error 投げられたもの
 * @returns ログに書く中身
 */
export function describeUnexpectedError(error: unknown): UnexpectedErrorLog {
  if (!(error instanceof Error)) return { errorName: "unknown" };
  const described: UnexpectedErrorLog = { errorName: error.name };
  const stack = stackFrames(error);
  if (stack) described.stack = stack;
  const db = findDatabaseError(error);
  const sqlState = matching(db?.code, SQL_STATE);
  if (db && sqlState) {
    described.sqlState = sqlState;
    const constraint = matching(db.constraint, IDENTIFIER);
    if (constraint) described.constraint = constraint;
    const table = matching(db.table, IDENTIFIER);
    if (table) described.table = table;
    const routine = matching(db.routine, ROUTINE);
    if (routine) described.routine = routine;
  }
  return described;
}
