// DB の接続。
// pg の Pool と Drizzle。列の名前は DB では snake_case、コードでは camelCase。
// つなぐ時間と、1つの命令の時間に上限を置く（DB が答えないとき、要求が待ち続けず、動いているかの窓口が 503 を返すように）。
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

/** DB を読み書きする道具（Drizzle）。 */
export type Db = NodePgDatabase;

/** 取引の中で使う DB（Db の transaction が渡すもの）。 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** 読み書きに使う DB（ふだんの Db か、取引の中の Tx）。取引の中でも外でも呼べる関数が受け取る。 */
export type Executor = Db | Tx;

/** DB の接続（Drizzle と、片付けるための Pool）。 */
export type Database = {
  /** Drizzle */
  db: Db;
  /** 接続の Pool。止めるときに end() する */
  pool: pg.Pool;
};

/** 時間の上限の既定（設定 DATABASE_CONNECT_TIMEOUT_MS・DATABASE_QUERY_TIMEOUT_MS と同じ）。 */
export const DEFAULT_DATABASE_TIMEOUTS = {
  connectTimeoutMs: 5000,
  queryTimeoutMs: 10_000,
} as const;

/** 時間の上限（ミリ秒）。 */
export type DatabaseTimeouts = {
  /** つなぐまでの上限 */
  connectTimeoutMs: number;
  /** 1つの命令の上限（DB の statement_timeout と、pg の待つ上限の両方に使う） */
  queryTimeoutMs: number;
};

/**
 * DB の接続を作る。
 * @param databaseUrl 接続先（設定の DATABASE_URL）
 * @param timeouts 時間の上限（既定は DEFAULT_DATABASE_TIMEOUTS）
 * @returns Drizzle と Pool
 */
export function createDatabase(
  databaseUrl: string,
  timeouts: DatabaseTimeouts = DEFAULT_DATABASE_TIMEOUTS,
): Database {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    // 1台あたりの接続の上限。Cloud Run は最大2台なので、合計が Cloud SQL（db-f1-micro）の上限を超えない（構成の決めごと AD-8）
    max: 5,
    connectionTimeoutMillis: timeouts.connectTimeoutMs,
    statement_timeout: timeouts.queryTimeoutMs,
    query_timeout: timeouts.queryTimeoutMs,
  });
  const db = drizzle({ client: pool, casing: "snake_case" });
  return { db, pool };
}
