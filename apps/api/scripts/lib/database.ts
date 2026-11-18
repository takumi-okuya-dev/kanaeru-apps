// DB を作る・確かめる手伝い（手順とテストで使う）。
import pg from "pg";

/** DB の名前として受け取る形（英小文字・数字・「_」で63文字まで）。 */
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * 接続先の DB の名前を取り出し、形を確かめる。
 * @param databaseUrl 接続先
 * @returns DB の名前
 * @throws {Error} 名前がない・形が合わない・%xx の形が崩れている・URL として読めないとき
 */
export function databaseNameOf(databaseUrl: string): string {
  const formatError = new Error(
    "DATABASE_URL の DB の名前は、英小文字・数字・「_」で63文字までにしてください。",
  );
  if (!URL.canParse(databaseUrl)) throw formatError;
  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    // %xx の形が崩れている（URIError をそのまま出さず、設定の誤りとして伝える）
    throw formatError;
  }
  if (!DATABASE_NAME.test(name)) throw formatError;
  return name;
}

/**
 * 同じサーバーの別の DB への接続先を作る。
 * @param databaseUrl もとの接続先
 * @param name DB の名前
 * @returns 接続先
 */
export function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * 管理用の DB（postgres）につないで、渡した処理を流す。
 * @param databaseUrl 同じサーバーのどれかの DB への接続先
 * @param run 流す処理
 * @returns 処理の結果
 */
export async function withAdminClient<T>(
  databaseUrl: string,
  run: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: withDatabaseName(databaseUrl, "postgres") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * 接続先の DB がなければ作る。
 * @param databaseUrl 接続先
 * @returns 作ったら true、もうあれば false
 */
export async function ensureDatabase(databaseUrl: string): Promise<boolean> {
  const name = databaseNameOf(databaseUrl);
  return withAdminClient(databaseUrl, async (client) => {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount) return false;
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    return true;
  });
}
