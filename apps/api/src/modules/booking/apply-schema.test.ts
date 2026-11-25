// 自前の申込みページの表の結合のテスト（本物の PostgreSQL）：使い方・見せる範囲・入口の CHECK と既定値・連絡のメールと札の一意・
// 案内の同意の相手はどちらか1つ・消し方（組織・持ち主・本人・交流会を消したとき）。窓口はまだないので、表に直に書いて確かめる
// （booking-003 の1つ目の PR。specs/booking/003-apply/data-model.md）。
import "@hono/zod-openapi";
import { BOOKING_MODES, VISIBILITIES } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

/** 見本の札の SHA-256（16進の64文字）。 */
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("自前の申込みページの表", () => {
  let app: TestApp;
  let ownerId: string;
  let eventId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    const owner = await loginAs(app, { displayName: "持ち主" });
    ownerId = owner.account.id;
    eventId = (await createEvent(app, owner.cookie)).id;
    organizationId = await createOrganization(app, owner.cookie);
  });

  /**
   * 数を数える。
   * @param sql 数える命令（テストの中で決めた文だけ）
   * @returns 数
   */
  async function countOf(sql: string): Promise<number> {
    const result = await database.pool.query<{ n: string }>(sql);
    return Number(result.rows[0]?.n);
  }

  /**
   * メールの申込みの行を表に直に足す。
   * @param email 連絡のメールアドレス
   * @param tokenHash 札の SHA-256
   * @returns 足した行の ID
   */
  async function insertEmailEntry(email: string | null, tokenHash: string | null): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind, contact_email, entry_token_hash)
       VALUES ($1, '小林 はると', 'direct', 'self_page', $2, $3) RETURNING id`,
      [eventId, email, tokenHash],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  it("設定の既定は受付を閉じる・誰でも。使い方と見せる範囲の code は入り、ほかは CHECK で止まる", async () => {
    await database.pool.query(
      "INSERT INTO booking_setting (event_id, mode) VALUES ($1, 'roster')",
      [eventId],
    );
    const row = await database.pool.query<{ accepting: boolean; visibility: string }>(
      "SELECT accepting, visibility FROM booking_setting WHERE event_id = $1",
      [eventId],
    );
    expect(row.rows[0]).toEqual({ accepting: false, visibility: "public" });
    for (const mode of BOOKING_MODES) {
      await database.pool.query("UPDATE booking_setting SET mode = $1 WHERE event_id = $2", [
        mode,
        eventId,
      ]);
    }
    for (const visibility of VISIBILITIES) {
      await database.pool.query("UPDATE booking_setting SET visibility = $1 WHERE event_id = $2", [
        visibility,
        eventId,
      ]);
    }
    await expect(
      database.pool.query("UPDATE booking_setting SET visibility = 'staff' WHERE event_id = $1", [
        eventId,
      ]),
    ).rejects.toThrow(/booking_setting_visibility_check/);
  });

  it("メールの申込みは、交流会ごとに同じアドレス1つ・札は1つの行だけ。アドレスは254文字まで", async () => {
    await insertEmailEntry("guest@example.com", HASH_A);
    await expect(insertEmailEntry("guest@example.com", HASH_B)).rejects.toThrow(
      /booking_entry_event_id_contact_email_unique/,
    );
    await expect(insertEmailEntry("other@example.com", HASH_A)).rejects.toThrow(
      /booking_entry_entry_token_hash_unique/,
    );
    // 空のアドレス・札（LINE の申込み・手で足した行）はいくつでも
    await insertEmailEntry(null, null);
    await insertEmailEntry(null, null);
    await expect(insertEmailEntry(`${"a".repeat(250)}@x.jp`, HASH_B)).rejects.toThrow(
      /booking_entry_contact_email_check/,
    );
  });

  it("案内の同意は、相手が組織か持ち主のどちらか1つで、相手ごとに1つ", async () => {
    const participant = await loginAs(app);
    const insertConsent = (organization: string | null, owner: string | null) =>
      database.pool.query(
        "INSERT INTO booking_consent (account_id, organization_id, owner_account_id) VALUES ($1, $2, $3)",
        [participant.account.id, organization, owner],
      );
    await insertConsent(organizationId, null);
    await insertConsent(null, ownerId);
    await expect(insertConsent(organizationId, null)).rejects.toThrow(
      /booking_consent_account_id_organization_id_unique/,
    );
    await expect(insertConsent(null, ownerId)).rejects.toThrow(
      /booking_consent_account_id_owner_account_id_unique/,
    );
    await expect(insertConsent(null, null)).rejects.toThrow(/booking_consent_holder_check/);
    await expect(insertConsent(organizationId, ownerId)).rejects.toThrow(
      /booking_consent_holder_check/,
    );
  });

  it("組織・持ち主・本人のどれを消しても、案内の同意が消える", async () => {
    const first = await loginAs(app);
    const second = await loginAs(app);
    await database.pool.query(
      `INSERT INTO booking_consent (account_id, organization_id, owner_account_id)
       VALUES ($1, $3, NULL), ($1, NULL, $4), ($2, $3, NULL)`,
      [first.account.id, second.account.id, organizationId, ownerId],
    );
    await database.pool.query("DELETE FROM account WHERE id = $1", [second.account.id]);
    expect(await countOf("SELECT count(*) AS n FROM booking_consent")).toBe(2);
    await database.pool.query("DELETE FROM organization WHERE id = $1", [organizationId]);
    expect(await countOf("SELECT count(*) AS n FROM booking_consent")).toBe(1);
    await database.pool.query("DELETE FROM event WHERE owner_account_id = $1", [ownerId]);
    await database.pool.query("DELETE FROM account WHERE id = $1", [ownerId]);
    expect(await countOf("SELECT count(*) AS n FROM booking_consent")).toBe(0);
  });

  it("確認の待ちの札は1つだけで、交流会を消すと待ちも消える", async () => {
    const insertRequest = (tokenHash: string) =>
      database.pool.query(
        `INSERT INTO booking_email_request (event_id, name, email, token_hash, expires_at)
         VALUES ($1, '小林 はると', 'guest@example.com', $2, now() + interval '24 hours')`,
        [eventId, tokenHash],
      );
    await insertRequest(HASH_A);
    await expect(insertRequest(HASH_A)).rejects.toThrow(/booking_email_request_token_hash_unique/);
    await insertRequest(HASH_B);
    await insertEmailEntry("guest@example.com", `${"c".repeat(63)}d`);
    await database.pool.query("DELETE FROM event WHERE id = $1", [eventId]);
    expect(
      await countOf(
        "SELECT (SELECT count(*) FROM booking_email_request) + (SELECT count(*) FROM booking_entry) AS n",
      ),
    ).toBe(0);
  });
});
