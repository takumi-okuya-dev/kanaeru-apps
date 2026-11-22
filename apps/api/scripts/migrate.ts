// 本番の DB の変更を当てる（Cloud Run jobs の db:migrate。core-002）。
// 本番のコンテナは開発の道具（drizzle-kit）を持たないので、drizzle-kit migrate が中で使うのと同じ
// drizzle-orm の migrator で apps/api/drizzle/ を当てる。当てた記録の表（drizzle.__drizzle_migrations）も同じなので、
// 手元の pnpm db:migrate と混ぜて使える。読む設定は DATABASE_URL だけ（DB は Terraform が作るので、ここでは作らない）。
// 1つの命令の時間の上限は付けない（索引を作る変更などが、API の上限〈DATABASE_QUERY_TIMEOUT_MS〉で切れないように）。
// 当てる前に、DB につながるまで待つ（core-018）。台が立ち上がってから Direct VPC egress で DB につながるまで、1分以上かかる
// ことがあるため（Google の文書）。job はやり直さない（max_retries = 0）ので、この中で確かめ直す。
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { waitUntilReady } from "./lib/wait-until-ready.ts";

/** つなぐまでの上限（ミリ秒）。夜間の停止などで DB に届かないとき、待ち続けずに失敗する。 */
const CONNECT_TIMEOUT_MS = 10_000;

/** DB につながるまで待つ上限（ミリ秒）。job の上限（600秒）の中に収める。 */
const READY_DEADLINE_MS = 180_000;

/** つながらなかったとき、確かめ直すまでの間（ミリ秒）。 */
const READY_INTERVAL_MS = 5_000;

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
  await waitUntilReady(
    async () => {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
    },
    {
      deadlineMs: READY_DEADLINE_MS,
      intervalMs: READY_INTERVAL_MS,
      onRetry: (attempt, error) => {
        // 誤りの文には接続先が入りうるので、名前と code だけを出す
        const code = (error as { code?: unknown } | null)?.code;
        const label =
          typeof code === "string" ? code : error instanceof Error ? error.name : typeof error;
        console.warn(`DB につながるのを待っています（${attempt}回目：${label}）。`);
      },
    },
  );
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("DB の変更を当てました。");
} finally {
  await pool.end();
}
