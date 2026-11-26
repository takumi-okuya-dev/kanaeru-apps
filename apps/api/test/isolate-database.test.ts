// DB を環境の利用者だけのものにする手順（apps/api/scripts/lib/isolate-database.ts）のテスト。
// 2026-11-26 の権限の確かめ（D1）で、Cloud SQL の API で作った利用者が cloudsqlsuperuser の一員のままだと、ステージングの
// 利用者が本番の利用者の権限を取れると分かったので、手順の終わりに一員から外す。
// Cloud SQL では利用者が自分を外せる（本物のサーバーで確かめた）が、ふつうの PostgreSQL ではまねできない
// （外せないか、外したつもりで何も起きない）。手元では、次の2つを確かめる。
// - 一員でない利用者なら、持ち主をその利用者にし、何度流しても通る（外したあとの2回目からの動き）
// - 一員なのに外せなかったら、黙って進まずに止まる
import pg from "pg";
import { afterEach, describe, expect, inject, it } from "vitest";
import { databaseNameOf, withAdminClient, withDatabaseName } from "../scripts/lib/database.ts";
import { isolateDatabase } from "../scripts/lib/isolate-database.ts";

const templateUrl = inject("testTemplateDatabaseUrl");
const pool = process.env.VITEST_POOL_ID ?? "1";
/** このテストだけで使う DB（<DB名>_test_ で始めるので、次の回の始めに global-setup が消す）。 */
const databaseName = databaseNameOf(templateUrl).replace(/_template$/, `_isolate_${pool}`);
/** Cloud SQL の API で作った利用者のまね（テストのための架空の値）。 */
const role = `isolate_probe_${pool}`;
const password = "isolate-probe-password";

/**
 * まねの利用者と、その利用者が使う DB を作り直す。
 * @param options cloudsqlsuperuser の一員にするか
 * @param options.member 一員にするなら true（DB の持ち主は cloudsqlsuperuser。Cloud SQL の API で作った DB と同じ）
 */
async function setUp(options: { member: boolean }): Promise<void> {
  await withAdminClient(templateUrl, async (client) => {
    // cloudsqlsuperuser はサーバーに1つ（ほかの回と取り合っても落ちないように）
    await client.query(`DO $$
BEGIN
  CREATE ROLE cloudsqlsuperuser NOLOGIN CREATEROLE CREATEDB;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END
$$`);
    await tearDown();
    const name = client.escapeIdentifier(role);
    await client.query(
      `CREATE ROLE ${name} LOGIN CREATEROLE CREATEDB PASSWORD ${client.escapeLiteral(password)}`,
    );
    if (options.member) await client.query(`GRANT cloudsqlsuperuser TO ${name}`);
    const owner = options.member ? "cloudsqlsuperuser" : name;
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(databaseName)} OWNER ${owner}`);
  });
}

/** まねの利用者と DB を消す。 */
async function tearDown(): Promise<void> {
  await withAdminClient(templateUrl, async (client) => {
    await client.query(
      `DROP DATABASE IF EXISTS ${client.escapeIdentifier(databaseName)} WITH (FORCE)`,
    );
    await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(role)}`);
  });
}

/**
 * まねの利用者として、このテストの DB につなぐ。
 * @returns つないだ道具
 */
async function connectAsProbe(): Promise<pg.Client> {
  const url = new URL(withDatabaseName(templateUrl, databaseName));
  url.username = role;
  url.password = password;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  return client;
}

describe("DB を環境の利用者だけのものにする", () => {
  afterEach(tearDown);

  it("cloudsqlsuperuser の一員でない利用者なら、持ち主をその利用者にし、何度流しても通る", async () => {
    await setUp({ member: false });
    const client = await connectAsProbe();
    try {
      await isolateDatabase(client);
      await isolateDatabase(client);
      const state = await client.query<{ owner: string; publicConnect: boolean }>(
        `SELECT pg_get_userbyid(datdba) AS owner,
                has_database_privilege('public', datname, 'CONNECT') AS "publicConnect"
           FROM pg_database WHERE datname = current_database()`,
      );
      expect(state.rows[0]).toEqual({ owner: role, publicConnect: false });
    } finally {
      await client.end();
    }
  });

  it("cloudsqlsuperuser の一員なのに外せなかったら、黙って進まずに止まる", async () => {
    await setUp({ member: true });
    const client = await connectAsProbe();
    try {
      await expect(isolateDatabase(client)).rejects.toThrow(/cloudsqlsuperuser/);
    } finally {
      await client.end();
    }
  });
});
