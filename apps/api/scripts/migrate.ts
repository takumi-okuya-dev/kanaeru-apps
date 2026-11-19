// 本番の DB の変更を当てる（Cloud Run jobs の db:migrate。core-002）。
// 本番のコンテナは開発の道具（drizzle-kit）を持たないので、drizzle-kit migrate が中で使うのと同じ
// drizzle-orm の migrator で apps/api/drizzle/ を当てる。当てた記録の表（drizzle.__drizzle_migrations）も同じなので、
// 手元の pnpm db:migrate と混ぜて使える。読む設定は DATABASE_URL だけ（DB は Terraform が作るので、ここでは作らない）。
// 1つの命令の時間の上限は付けない（索引を作る変更などが、API の上限〈DATABASE_QUERY_TIMEOUT_MS〉で切れないように）。
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** つなぐまでの上限（ミリ秒）。夜間の停止などで DB に届かないとき、待ち続けずに失敗する。 */
const CONNECT_TIMEOUT_MS = 10_000;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL を入れてください。");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  max: 1,
});
try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("DB の変更を当てました。");
} finally {
  await pool.end();
}
