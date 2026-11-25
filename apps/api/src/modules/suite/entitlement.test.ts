// 契約があるか（AD-16・AD-22）の結合のテスト（本物の PostgreSQL）：売り始める前はいつも使える・
// 持ち主の個人の契約・記録を入れた組織の契約（組織の人の個人の記録には効かない）・持ち主はどちらか1つ（CHECK）。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";
import { ENTITLEMENTS_ENFORCED, hasEntitlement } from "./index.ts";

const database = useTestDatabase();

describe("契約があるか", () => {
  let accountId: string;
  let otherId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    const app = buildApp(database);
    const me = await loginAs(app, { displayName: "持ち主" });
    accountId = me.account.id;
    otherId = (await loginAs(app)).account.id;
    organizationId = await createOrganization(app, me.cookie);
  });

  it("売り始める前は、契約がなくても使える", async () => {
    expect(ENTITLEMENTS_ENFORCED).toBe(false);
    expect(
      await hasEntitlement(
        database.db,
        { ownerAccountId: accountId, organizationId: null },
        "threads",
      ),
    ).toBe(true);
  });

  it("持ち主の個人の契約か、記録を入れた組織の契約のどちらかがあれば使える", async () => {
    const subject = { ownerAccountId: accountId, organizationId: null };
    expect(await hasEntitlement(database.db, subject, "threads", true)).toBe(false);

    await database.pool.query(
      "INSERT INTO entitlement (app_key, holder_organization_id) VALUES ('threads', $1)",
      [organizationId],
    );
    // 組織の契約は、組織に入れた記録にだけ効く
    expect(await hasEntitlement(database.db, subject, "threads", true)).toBe(false);
    expect(
      await hasEntitlement(
        database.db,
        { ownerAccountId: otherId, organizationId },
        "threads",
        true,
      ),
    ).toBe(true);
    // ほかのアプリの契約は効かない
    expect(
      await hasEntitlement(
        database.db,
        { ownerAccountId: otherId, organizationId },
        "reception",
        true,
      ),
    ).toBe(false);

    await database.pool.query(
      "INSERT INTO entitlement (app_key, holder_account_id) VALUES ('threads', $1)",
      [accountId],
    );
    expect(await hasEntitlement(database.db, subject, "threads", true)).toBe(true);
  });

  it("持ち主はアカウントか組織のどちらか1つ（両方・どちらもなしは CHECK で止まる）。持ち主が消えると契約も消える", async () => {
    await expect(
      database.pool.query("INSERT INTO entitlement (app_key) VALUES ('threads')"),
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        "INSERT INTO entitlement (app_key, holder_account_id, holder_organization_id) VALUES ('threads', $1, $2)",
        [accountId, organizationId],
      ),
    ).rejects.toThrow();
    await database.pool.query(
      "INSERT INTO entitlement (app_key, holder_account_id) VALUES ('threads', $1)",
      [accountId],
    );
    await database.pool.query(
      "INSERT INTO entitlement (app_key, holder_organization_id) VALUES ('threads', $1)",
      [organizationId],
    );
    await database.pool.query("DELETE FROM organization WHERE id = $1", [organizationId]);
    await database.pool.query("DELETE FROM account WHERE id = $1", [accountId]);
    const left = await database.pool.query("SELECT 1 FROM entitlement");
    expect(left.rowCount).toBe(0);
  });
});
