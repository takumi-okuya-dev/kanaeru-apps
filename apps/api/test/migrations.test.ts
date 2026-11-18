// DB の変更を当てる手順（pnpm db:migrate）のテスト。
// 空の DB（なければ手順が作る）に当て、もう一度当てても、表・列・索引が変わらず、記録の行も増えないこと。
// 表の名前は書き並べない（DB の pg_catalog・information_schema から読む）。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";
import { databaseNameOf, withAdminClient, withDatabaseName } from "../scripts/lib/database.ts";

/** apps/api のフォルダ。 */
const apiDir = fileURLToPath(new URL("..", import.meta.url));

/** このテストだけで使う DB（<DB名>_test_ で始めるので、次の回の始めに global-setup が消す）。 */
const templateUrl = inject("testTemplateDatabaseUrl");
const databaseName = databaseNameOf(templateUrl).replace(
  /_template$/,
  `_migrations_${process.env.VITEST_POOL_ID ?? "1"}`,
);
const databaseUrl = withDatabaseName(templateUrl, databaseName);

/** 手順のとおりに DB の変更を当てる（DB がなければ作る）。 */
function runMigrate(): void {
  execFileSync("pnpm", ["run", "db:migrate"], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

/**
 * DB の形（表・列・索引・制約）と、DB の変更の記録の行の数を読む。
 * @returns DB の形
 */
async function readShape() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const columns = await client.query(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1, 2, 3`,
    );
    const indexes = await client.query(
      `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2, 3`,
    );
    const constraints = await client.query(
      `SELECT conrelid::regclass::text AS table, conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE connamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
        ORDER BY 1, 2`,
    );
    const applied = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM drizzle.__drizzle_migrations",
    );
    return {
      columns: columns.rows,
      indexes: indexes.rows,
      constraints: constraints.rows,
      applied: Number(applied.rows[0]?.count ?? 0),
    };
  } finally {
    await client.end();
  }
}

describe("DB の変更を当てる手順", () => {
  afterAll(async () => {
    await withAdminClient(templateUrl, async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS ${client.escapeIdentifier(databaseName)} WITH (FORCE)`,
      );
    });
  });

  it("空の DB に当て、もう一度当てても、形が変わらず記録の行も増えない", async () => {
    await withAdminClient(templateUrl, async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS ${client.escapeIdentifier(databaseName)} WITH (FORCE)`,
      );
    });

    runMigrate();
    const first = await readShape();
    const journal = JSON.parse(
      readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: unknown[] };
    // すべての DB の変更が1回ずつ当たっている
    expect(first.applied).toBe(journal.entries.length);
    expect(first.columns.length).toBeGreaterThan(0);

    runMigrate();
    expect(await readShape()).toEqual(first);
  }, 60_000);
});
