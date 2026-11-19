// API の結合のテストの DB。
// Vitest の働き手ごとに、雛形の DB から CREATE DATABASE … TEMPLATE … で写す。
// テストのファイルの始めに、pg_catalog から表を読んで全部を空にする（表の名前を書き並べない）。
// 空にしたあと、DB の変更が入れた初めの行（suite の台帳：受付アプリは公開）を戻す（本番と同じ初めの状態にする）。
import { afterAll, beforeAll, inject } from "vitest";
import { databaseNameOf, withAdminClient, withDatabaseName } from "../../scripts/lib/database.ts";
import { createDatabase } from "../../src/kernel/db.ts";
import type { Database } from "../../src/kernel/db.ts";
import { restoreInitialAppSettings } from "../../src/modules/suite/index.ts";

/** 空にしない schema（PostgreSQL の中と、DB の変更の記録）。 */
export const KEPT_SCHEMAS = ["pg_catalog", "information_schema", "drizzle"];

/**
 * この働き手の DB を用意する（なければ雛形から写す）。
 * @returns この働き手の DB への接続先
 */
async function ensureWorkerDatabase(): Promise<string> {
  const templateUrl = inject("testTemplateDatabaseUrl");
  const templateName = databaseNameOf(templateUrl);
  const workerName = templateName.replace(/_template$/, `_${process.env.VITEST_POOL_ID ?? "1"}`);
  await withAdminClient(templateUrl, async (client) => {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [workerName]);
    if (found.rowCount) return;
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(workerName)} TEMPLATE ${client.escapeIdentifier(templateName)}`,
    );
  });
  return withDatabaseName(templateUrl, workerName);
}

/**
 * DB のアプリの表を全部空にし、DB の変更が入れた初めの行を戻す（表は pg_catalog から読む）。
 * @param database DB の接続
 */
export async function truncateAllTables(database: Database): Promise<void> {
  const tables = await database.pool.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, c.relname AS name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname <> ALL($1::text[])
        AND n.nspname NOT LIKE 'pg_toast%'`,
    [KEPT_SCHEMAS],
  );
  if (tables.rows.length === 0) return;
  const names = tables.rows
    .map(({ schema, name }) => `"${schema.replaceAll('"', '""')}"."${name.replaceAll('"', '""')}"`)
    .join(", ");
  await database.pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
  await restoreInitialAppSettings(database.db);
}

/** テストのファイルで使う DB。beforeAll のあとに読む。 */
export type TestDatabase = Database & {
  /** この働き手の DB への接続先 */
  databaseUrl: string;
};

/**
 * テストのファイルの DB を用意する。ファイルの始めに全部の表を空にし、終わりに接続を閉じる。
 * process.env.DATABASE_URL も、この働き手の DB に替える（設定を読む処理が同じ DB を使うように）。
 * @returns beforeAll のあとに中身が入る、DB の接続
 */
export function useTestDatabase(): TestDatabase {
  const holder = {} as TestDatabase;
  beforeAll(async () => {
    const databaseUrl = await ensureWorkerDatabase();
    process.env.DATABASE_URL = databaseUrl;
    Object.assign(holder, createDatabase(databaseUrl), { databaseUrl });
    await truncateAllTables(holder);
  });
  afterAll(async () => {
    await holder.pool?.end();
  });
  return holder;
}
