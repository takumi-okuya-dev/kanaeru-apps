// PostgreSQL のエラーの見分け。一意の制約の違反（領域の読み書きが使う）と、DB に届かないこと（kernel/errors.ts が使う）。

/** PostgreSQL の一意の制約の違反の code。 */
const UNIQUE_VIOLATION = "23505";

/**
 * 一意の制約の違反か（drizzle が包んだ違反は cause に入る）。
 * @param error 投げられたもの
 * @returns 違反なら true
 */
export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (
    (error as { code?: string } | null)?.code === UNIQUE_VIOLATION ||
    cause?.code === UNIQUE_VIOLATION
  );
}

/** DB に届かないときの、Node のつなぐときのエラーの code（Cloud SQL の Unix ソケットがない ENOENT を含む）。 */
const UNREACHABLE_NODE_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENOENT",
  "EPIPE",
]);

/** DB が止める途中・起動の途中の SQLSTATE（admin_shutdown・crash_shutdown・cannot_connect_now）。 */
const UNAVAILABLE_SQLSTATES: ReadonlySet<string> = new Set(["57P01", "57P02", "57P03"]);

/** pg が、つなげない・答えがないときに投げるエラーの文（code を持たない）。 */
const UNREACHABLE_MESSAGES = [
  /^Connection terminated/,
  /timeout exceeded when trying to connect/,
  /^Query read timeout/,
];

/** 包み（cause・AggregateError の errors）を開く深さの上限。 */
const MAX_DEPTH = 5;

/**
 * 1つのエラーそのものが、DB に届かないことを表すか（包みは開かない）。
 * @param error 調べるもの
 * @returns 届かないなら true
 */
function isUnreachableItself(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string") {
    if (UNREACHABLE_NODE_CODES.has(code) || UNAVAILABLE_SQLSTATES.has(code)) return true;
    // SQLSTATE のクラス 08：接続の例外
    if (/^08[0-9A-Z]{3}$/.test(code)) return true;
  }
  return (
    typeof message === "string" && UNREACHABLE_MESSAGES.some((pattern) => pattern.test(message))
  );
}

/**
 * DB に届かない（つなげない・時間切れ・止まっている）ことによるエラーか。
 * drizzle が包んだもの（cause）と、つなぐ先が複数のときの AggregateError（errors）も開いて見る。
 * 制約の違反・命令の時間切れ（statement_timeout）・接続が多すぎる、は DB に届いているので false。
 * @param error 投げられたもの
 * @returns 届かないなら true
 */
export function isDbUnavailable(error: unknown): boolean {
  const queue: { value: unknown; depth: number }[] = [{ value: error, depth: 0 }];
  while (queue.length > 0) {
    const { value, depth } = queue.shift() ?? { value: undefined, depth: 0 };
    if (isUnreachableItself(value)) return true;
    if (depth >= MAX_DEPTH || typeof value !== "object" || value === null) continue;
    const { cause, errors } = value as { cause?: unknown; errors?: unknown };
    if (cause !== undefined) queue.push({ value: cause, depth: depth + 1 });
    if (Array.isArray(errors)) {
      for (const item of errors) queue.push({ value: item, depth: depth + 1 });
    }
  }
  return false;
}
