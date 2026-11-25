// 予約の知らせの表の結合のテスト（本物の PostgreSQL）：持ち主はどちらか1つ・LINE の値はそろう・一意・選択肢の CHECK と約束が
// 食い違わない・消し方（組織・アカウント・申込み・設定を消したとき）。窓口はまだないので、表に直に書いて確かめる
// （booking-002 の1つ目の PR）。
import "@hono/zod-openapi";
import { NOTICE_KINDS, NOTICE_METHODS, NOTICE_RESULTS } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

/** 見本の LINE のユーザー ID（公式アカウントから見えるもの）。 */
const LINE_USER = `U${"a".repeat(32)}`;
const OTHER_LINE_USER = `U${"b".repeat(32)}`;

/** LINE の値をそろえて入れる命令（見本。暗号文は中身のないバイト）。 */
const SET_LINE_VALUES = `UPDATE booking_line_channel SET line_channel_id = '1234567890',
  channel_secret_ciphertext = '\\x00', channel_secret_iv = '\\x00', channel_secret_key_version = 1, channel_secret_tail = 'cdef',
  access_token_ciphertext = '\\x00', access_token_iv = '\\x00', access_token_key_version = 1, access_token_tail = 'wxyz'
  WHERE id = $1`;

describe("予約の知らせの表", () => {
  let app: TestApp;
  let ownerId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    const owner = await loginAs(app, { displayName: "持ち主" });
    ownerId = owner.account.id;
    organizationId = await createOrganization(app, owner.cookie);
  });

  /**
   * 公式アカウントの設定を足す（LINE の値は入れない）。
   * @param holder 持ち主の列
   * @returns 行の ID
   */
  async function insertChannel(holder: {
    accountId?: string | null;
    organizationId?: string | null;
  }): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_line_channel (holder_account_id, holder_organization_id) VALUES ($1, $2) RETURNING id`,
      [holder.accountId ?? null, holder.organizationId ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 数を数える。
   * @param table 表の名前（テストの中で決めた値だけ）
   * @returns 行の数
   */
  async function count(
    table:
      "booking_line_channel" | "booking_line_link" | "booking_line_link_token" | "booking_contact",
  ): Promise<number> {
    const queries = {
      booking_line_channel: "SELECT count(*) AS n FROM booking_line_channel",
      booking_line_link: "SELECT count(*) AS n FROM booking_line_link",
      booking_line_link_token: "SELECT count(*) AS n FROM booking_line_link_token",
      booking_contact: "SELECT count(*) AS n FROM booking_contact",
    } as const;
    const result = await database.pool.query<{ n: string }>(queries[table]);
    return Number(result.rows[0]?.n);
  }

  it("持ち主はアカウントか組織のどちらか1つで、持ち主ごとに1行", async () => {
    await insertChannel({ organizationId });
    await insertChannel({ accountId: ownerId });
    await expect(insertChannel({})).rejects.toThrow(/booking_line_channel_holder_check/);
    await expect(insertChannel({ accountId: ownerId, organizationId })).rejects.toThrow(
      /booking_line_channel_holder_check/,
    );
    await expect(insertChannel({ organizationId })).rejects.toThrow(
      /booking_line_channel_holder_organization_id_unique/,
    );
    await expect(insertChannel({ accountId: ownerId })).rejects.toThrow(
      /booking_line_channel_holder_account_id_unique/,
    );
  });

  it("LINE の値は、そろって空か、そろって入っている（返信先だけの行を許す）", async () => {
    const id = await insertChannel({ organizationId });
    await database.pool.query(
      "UPDATE booking_line_channel SET reply_to_email = 'reply@example.com' WHERE id = $1",
      [id],
    );
    await expect(
      database.pool.query(
        "UPDATE booking_line_channel SET line_channel_id = '1234567890' WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/booking_line_channel_line_check/);
    await database.pool.query(SET_LINE_VALUES, [id]);
    await expect(
      database.pool.query(
        "UPDATE booking_line_channel SET access_token_tail = NULL WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/booking_line_channel_line_check/);
  });

  it("同じ公式アカウント（チャネル ID）は1つの設定にしか入らない。ボットの userId は空でもよい", async () => {
    const first = await insertChannel({ organizationId });
    const second = await insertChannel({ accountId: ownerId });
    await database.pool.query(SET_LINE_VALUES, [first]);
    await expect(database.pool.query(SET_LINE_VALUES, [second])).rejects.toThrow(
      /booking_line_channel_line_channel_id_unique/,
    );
    await database.pool.query(
      `UPDATE booking_line_channel SET bot_user_id = 'U${"f".repeat(32)}' WHERE id = $1`,
      [first],
    );
    // LINE の値のない行どうしは、いくつあってもよい
    const other = await createOrganization(app, (await loginAs(app)).cookie);
    await insertChannel({ organizationId: other });
  });

  it("紐づけは設定ごとに、アカウント1つ・LINE の友だち1人に1つ。LINE のユーザー ID の形を確かめる", async () => {
    const channelId = await insertChannel({ organizationId });
    const participant = await loginAs(app);
    const insertLink = (lineUserId: string, accountId: string) =>
      database.pool.query(
        "INSERT INTO booking_line_link (channel_id, line_user_id, account_id) VALUES ($1, $2, $3)",
        [channelId, lineUserId, accountId],
      );
    await insertLink(LINE_USER, participant.account.id);
    await expect(insertLink(OTHER_LINE_USER, participant.account.id)).rejects.toThrow(
      /booking_line_link_channel_id_account_id_unique/,
    );
    await expect(insertLink(LINE_USER, ownerId)).rejects.toThrow(
      /booking_line_link_channel_id_line_user_id_unique/,
    );
    await expect(insertLink("not-a-line-id", ownerId)).rejects.toThrow(
      /booking_line_link_line_user_id_check/,
    );
    // ほかの設定なら、同じ人がもう1つ紐づける
    const personal = await insertChannel({ accountId: ownerId });
    await database.pool.query(
      "INSERT INTO booking_line_link (channel_id, line_user_id, account_id) VALUES ($1, $2, $3)",
      [personal, OTHER_LINE_USER, participant.account.id],
    );
  });

  it("札は SHA-256 で一意", async () => {
    const channelId = await insertChannel({ organizationId });
    const insertToken = () =>
      database.pool.query(
        `INSERT INTO booking_line_link_token (channel_id, line_user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '7 days')`,
        [channelId, LINE_USER, "a".repeat(64)],
      );
    await insertToken();
    await expect(insertToken()).rejects.toThrow(/booking_line_link_token_token_hash_unique/);
  });

  it("知らせの記録の種類・手段・結果の code はどれも入り、ほかは止まる。申込みが空なのは確かめのメッセージだけ", async () => {
    const owner = await loginAs(app, { displayName: "主催者" });
    const eventId = (await createEvent(app, owner.cookie)).id;
    const entry = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind)
       VALUES ($1, '山田 花子', 'other', 'manual') RETURNING id`,
      [eventId],
    );
    const entryId = entry.rows[0]?.id ?? "";
    for (const kind of NOTICE_KINDS) {
      for (const method of NOTICE_METHODS) {
        for (const result of NOTICE_RESULTS) {
          await database.pool.query(
            "INSERT INTO booking_notice (entry_id, kind, method, result) VALUES ($1, $2, $3, $4)",
            [kind === "test" ? null : entryId, kind, method, result],
          );
        }
      }
    }
    const insert = (values: [string | null, string, string, string]) =>
      database.pool.query(
        "INSERT INTO booking_notice (entry_id, kind, method, result) VALUES ($1, $2, $3, $4)",
        values,
      );
    await expect(insert([entryId, "reminder", "line", "sent"])).rejects.toThrow(
      /booking_notice_kind_check/,
    );
    await expect(insert([entryId, "confirmed", "sms", "sent"])).rejects.toThrow(
      /booking_notice_method_check/,
    );
    await expect(insert([entryId, "confirmed", "line", "queued"])).rejects.toThrow(
      /booking_notice_result_check/,
    );
    await expect(insert([null, "confirmed", "line", "sent"])).rejects.toThrow(
      /booking_notice_entry_check/,
    );
    await expect(insert([entryId, "test", "line", "sent"])).rejects.toThrow(
      /booking_notice_entry_check/,
    );
    // 申込みを消すと記録も消える
    await database.pool.query("DELETE FROM booking_entry WHERE id = $1", [entryId]);
    const left = await database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM booking_notice WHERE entry_id IS NOT NULL",
    );
    expect(Number(left.rows[0]?.n)).toBe(0);
  });

  it("組織を消すと、組織の設定・紐づけ・札が消え、記録の設定が空になる", async () => {
    const channelId = await insertChannel({ organizationId });
    const participant = await loginAs(app);
    await database.pool.query(
      "INSERT INTO booking_line_link (channel_id, line_user_id, account_id) VALUES ($1, $2, $3)",
      [channelId, LINE_USER, participant.account.id],
    );
    await database.pool.query(
      `INSERT INTO booking_line_link_token (channel_id, line_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now())`,
      [channelId, LINE_USER, "b".repeat(64)],
    );
    await database.pool.query(
      "INSERT INTO booking_notice (channel_id, kind, method, result) VALUES ($1, 'test', 'line', 'sent')",
      [channelId],
    );
    await database.pool.query("DELETE FROM organization WHERE id = $1", [organizationId]);
    expect(await count("booking_line_channel")).toBe(0);
    expect(await count("booking_line_link")).toBe(0);
    expect(await count("booking_line_link_token")).toBe(0);
    const notice = await database.pool.query<{ channel_id: string | null }>(
      "SELECT channel_id FROM booking_notice",
    );
    expect(notice.rows).toEqual([{ channel_id: null }]);
  });

  it("アカウントを消すと、個人の設定・その人の紐づけ・連絡のメールアドレスが消え、札の使った人は空になる", async () => {
    const participant = await loginAs(app);
    const personal = await insertChannel({ accountId: participant.account.id });
    const orgChannel = await insertChannel({ organizationId });
    await database.pool.query(
      "INSERT INTO booking_line_link (channel_id, line_user_id, account_id) VALUES ($1, $2, $3)",
      [orgChannel, LINE_USER, participant.account.id],
    );
    await database.pool.query(
      `INSERT INTO booking_line_link_token (channel_id, line_user_id, token_hash, expires_at, used_at, used_by_account_id)
       VALUES ($1, $2, $3, now(), now(), $4)`,
      [orgChannel, LINE_USER, "c".repeat(64), participant.account.id],
    );
    await database.pool.query(
      "INSERT INTO booking_contact (account_id, email) VALUES ($1, 'hanako@example.com')",
      [participant.account.id],
    );
    await expect(
      database.pool.query("INSERT INTO booking_contact (account_id, email) VALUES ($1, $2)", [
        ownerId,
        `${"a".repeat(250)}@example.com`,
      ]),
    ).rejects.toThrow(/booking_contact_email_check/);

    await database.pool.query("DELETE FROM account WHERE id = $1", [participant.account.id]);
    const channels = await database.pool.query<{ id: string }>(
      "SELECT id FROM booking_line_channel",
    );
    expect(channels.rows.map((row) => row.id)).toEqual([orgChannel]);
    expect(channels.rows.some((row) => row.id === personal)).toBe(false);
    expect(await count("booking_line_link")).toBe(0);
    expect(await count("booking_contact")).toBe(0);
    const token = await database.pool.query<{ used_by_account_id: string | null }>(
      "SELECT used_by_account_id FROM booking_line_link_token",
    );
    expect(token.rows).toEqual([{ used_by_account_id: null }]);
  });
});
