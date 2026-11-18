// API の結合のテストの始めに1回だけ流す。
// <DB名>_test_template を作り直して DB の変更を当て、前の回に残った働き手ごとの DB を消す。
// 働き手ごとの DB は、test/helpers/db.ts がこの雛形から写して作る。
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { databaseNameOf, withAdminClient, withDatabaseName } from "../../scripts/lib/database.ts";
import { readRootEnv } from "./env.ts";

declare module "vitest" {
  export interface ProvidedContext {
    /** 雛形の DB への接続先 */
    testTemplateDatabaseUrl: string;
  }
}

/**
 * 雛形の DB を作り直し、DB の変更を当てる。
 * @param project Vitest の project（雛形の接続先を働き手に渡す）
 */
export default async function setup(project: TestProject): Promise<void> {
  // .env がない所（CI など）では、compose の Postgres の既定の接続先を使う
  const databaseUrl =
    readRootEnv().DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/app";
  const baseName = databaseNameOf(databaseUrl);
  const templateName = `${baseName}_test_template`;
  const templateUrl = withDatabaseName(databaseUrl, templateName);

  await withAdminClient(databaseUrl, async (client) => {
    // 前の回の働き手ごとの DB と雛形を消す（DB の変更が増えていても、作り直して当てる）
    const stale = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE starts_with(datname, $1)",
      [`${baseName}_test_`],
    );
    for (const { datname } of stale.rows) {
      await client.query(
        `DROP DATABASE IF EXISTS ${client.escapeIdentifier(datname)} WITH (FORCE)`,
      );
    }
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(templateName)}`);
  });

  const pool = new pg.Pool({ connectionString: templateUrl });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    });
  } finally {
    await pool.end();
  }

  project.provide("testTemplateDatabaseUrl", templateUrl);
}
