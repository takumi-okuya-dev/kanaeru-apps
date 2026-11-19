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

/** 接続の設定の既定（設定 DATABASE_CONNECT_TIMEOUT_MS・DATABASE_QUERY_TIMEOUT_MS・DATABASE_POOL_MAX と同じ）。 */
export const DEFAULT_DATABASE_OPTIONS = {
  connectTimeoutMs: 5000,
  queryTimeoutMs: 10_000,
  poolMax: 10,
} as const;

/** 接続の設定（時間はミリ秒）。 */
export type DatabaseOptions = {
  /** つなぐまでの上限 */
  connectTimeoutMs: number;
  /** 1つの命令の上限（DB の statement_timeout と、pg の待つ上限の両方に使う） */
  queryTimeoutMs: number;
  /** 1つのプロセス（1台）が持つ接続の数の上限 */
  poolMax: number;
};

/**
 * DB の接続を作る。
 * @param databaseUrl 接続先（設定の DATABASE_URL）
 * @param options 接続の設定（渡さなかった値は DEFAULT_DATABASE_OPTIONS）
 * @param onIdleClientError 待っている接続が切れたときに呼ぶ（ログに残すため。既定は何もしない）
 * @returns Drizzle と Pool
 */
export function createDatabase(
  databaseUrl: string,
  options: Partial<DatabaseOptions> = {},
  onIdleClientError: (error: Error) => void = () => {},
): Database {
  const queryTimeoutMs = options.queryTimeoutMs ?? DEFAULT_DATABASE_OPTIONS.queryTimeoutMs;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    // 1台あたりの接続の上限（設定 DATABASE_POOL_MAX）。本番は infra/cloud_run.tf で、
    // 台数の上限 × この値が Cloud SQL（db-f1-micro）の接続の上限を超えないように決める（構成の決めごと AD-8）
    max: options.poolMax ?? DEFAULT_DATABASE_OPTIONS.poolMax,
    connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_DATABASE_OPTIONS.connectTimeoutMs,
    statement_timeout: queryTimeoutMs,
    query_timeout: queryTimeoutMs,
  });
  // 待っている接続が DB の側で切られると（夜間の停止・再起動）、Pool が 'error' を出す。
  // 受け手がないとプロセスごと落ちるので、必ず受ける。切れた接続は Pool が捨て、次の要求でつなぎ直す（構成の決めごと AD-10）
  pool.on("error", onIdleClientError);
  const db = drizzle({ client: pool, casing: "snake_case" });
  return { db, pool };
}
