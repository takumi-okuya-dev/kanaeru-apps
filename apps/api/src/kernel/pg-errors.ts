// PostgreSQL のエラーの見分け。一意の制約の違反（領域の読み書きが使う）と、DB に届かないこと（kernel/errors.ts が使う）。
import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";

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

/**
 * DB の口に届かないときの、Node のソケットのエラーの code。
 * ENOENT は Cloud SQL の Unix ソケット（/cloudsql/…/.s.PGSQL.5432）がないとき。
 */
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

/** つなぐときのソケットのエラーの syscall（名前を引く・つなぐ）。 */
const CONNECT_SYSCALLS: ReadonlySet<string> = new Set(["connect", "getaddrinfo"]);

/** DB が止める途中・起動の途中の SQLSTATE（admin_shutdown・crash_shutdown・cannot_connect_now）。 */
const UNAVAILABLE_SQLSTATES: ReadonlySet<string> = new Set(["57P01", "57P02", "57P03"]);

/**
 * pg が、DB の口に届かない・DB に切られたときに投げるエラーの文（code を持たない）。
 * - `Connection terminated unexpectedly`：DB の側が接続を切った（止まった・再起動した）
 * - `Connection terminated due to connection timeout`：DB の口につなぐのが時間切れ（pg-pool が新しくつなぐとき）
 *
 * 次は DB に届いているので含めない（500 の INTERNAL になる）：
 * - `timeout exceeded when trying to connect`：pg-pool の空きを待つのが時間切れ（混んでいる）
 * - `Query read timeout`：命令の答えが遅い（query_timeout）
 */
const UNREACHABLE_MESSAGES = [
  /^Connection terminated unexpectedly$/,
  /^Connection terminated due to connection timeout$/,
];

/** 包み（cause・AggregateError の errors）を開く深さの上限。 */
const MAX_DEPTH = 5;

/**
 * pg が投げた文・SQLSTATE・ソケットの code のどれかが、DB に届かないことを表すか（包みは開かない）。
 * DB の層から来たと分かっているエラーの中だけで使う（ほかの通信のエラーと見分けられないため）。
 * @param error 調べるもの
 * @returns 届かないなら true
 */
function isUnreachableSignal(error: unknown): boolean {
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
 * 包み（cause・AggregateError の errors）を MAX_DEPTH まで開き、どれかが DB に届かないことを表すか。
 * @param error 調べるもの
 * @returns 届かないなら true
 */
function someUnreachableInChain(error: unknown): boolean {
  const queue: { value: unknown; depth: number }[] = [{ value: error, depth: 0 }];
  while (queue.length > 0) {
    const { value, depth } = queue.shift() ?? { value: undefined, depth: 0 };
    if (isUnreachableSignal(value)) return true;
    if (depth >= MAX_DEPTH || typeof value !== "object" || value === null) continue;
    const { cause, errors } = value as { cause?: unknown; errors?: unknown };
    if (cause !== undefined) queue.push({ value: cause, depth: depth + 1 });
    if (Array.isArray(errors)) {
      for (const item of errors) queue.push({ value: item, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * 包まれずに投げられた、ソケットのつなぐときのエラーか（pg が DB の口につなげなかった形）。
 * ENOENT は Unix ソケットの道（`.s.PGSQL.`）につなぐときだけ（ファイルの ENOENT は syscall が open など）。
 * @param error 調べるもの
 * @returns つなぐときのエラーなら true
 */
function isRawConnectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, syscall, address } = error as {
    code?: unknown;
    syscall?: unknown;
    address?: unknown;
  };
  if (typeof code !== "string" || typeof syscall !== "string") return false;
  if (!UNREACHABLE_NODE_CODES.has(code) || !CONNECT_SYSCALLS.has(syscall)) return false;
  return code !== "ENOENT" || (typeof address === "string" && address.includes("/.s.PGSQL."));
}

/**
 * DB に届かない（つなげない・つなぐのが時間切れ・DB が止まっている・DB に切られた）ことによるエラーか。
 *
 * DB の層から来たエラーだけを見る（LINE への fetch の ENOTFOUND や、ファイルの ENOENT を 503 にしないため）：
 * 1. Drizzle の命令のエラー（DrizzleQueryError）：包み（cause・AggregateError）を開き、pg の文・SQLSTATE・ソケットの code を見る
 * 2. 包まれずに届いた pg のエラー（db.transaction の pool.connect() など）：
 *    pg の DatabaseError の SQLSTATE、pg の決まった文、ソケットのつなぐときのエラー（syscall が connect・getaddrinfo）、
 *    それらだけを束ねた AggregateError（localhost の IPv4・IPv6 の両方に断られた形）
 *
 * fetch の失敗は TypeError（fetch failed）にソケットのエラーを包んだ形なので、2 に当たらない。
 * 制約の違反・命令の時間切れ（statement_timeout・query_timeout）・接続が多すぎる・pg-pool の空き待ちの時間切れは、
 * DB に届いている（混んでいる・遅い）ので false。
 * @param error 投げられたもの
 * @returns 届かないなら true
 */
export function isDbUnavailable(error: unknown): boolean {
  if (error instanceof DrizzleQueryError) return someUnreachableInChain(error.cause);
  if (error instanceof pg.DatabaseError) return isUnreachableSignal(error);
  if (error instanceof AggregateError) {
    return error.errors.length > 0 && error.errors.every((item) => isRawConnectError(item));
  }
  if (isRawConnectError(error)) return true;
  return (
    error instanceof Error && UNREACHABLE_MESSAGES.some((pattern) => pattern.test(error.message))
  );
}
