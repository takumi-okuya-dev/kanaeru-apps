// 定員・媒体の枠・キャンセル待ち・打診の表の結合のテスト（本物の PostgreSQL）：定員・枠・打診の状態の CHECK・状態と知らせの種類の
// 新しい値・枠の一意・待っている打診は申込みごとに1つ・返事の札の一意・消し方（交流会・申込み・主催者を消したとき）。
// 窓口はまだないので、表に直に書いて確かめる（booking-004 の1つ目の PR。specs/booking/004-waitlist/data-model.md）。
import "@hono/zod-openapi";
import { OFFER_STATUSES, QUOTA_SOURCES } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** 見本の札の SHA-256（16進の64文字）。 */
const HASH_A = "a".repeat(64);

/** 見本の期限。 */
const DEADLINE = "2026-12-01T03:00:00Z";

describe("定員・枠・打診の表", () => {
  let app: TestApp;
  let eventId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    const owner = await loginAs(app, { displayName: "持ち主" });
    eventId = (await createEvent(app, owner.cookie)).id;
    await database.pool.query(
      "INSERT INTO booking_setting (event_id, mode) VALUES ($1, 'self_page')",
      [eventId],
    );
  });

  /**
   * 数を数える。
   * @param sql 数える命令（テストの中で決めた文だけ）
   * @param values 値
   * @returns 数
   */
  async function countOf(sql: string, values: unknown[] = []): Promise<number> {
    const result = await database.pool.query<{ n: string }>(sql, values);
    return Number(result.rows[0]?.n);
  }

  /**
   * 申込みを表に直に足す。
   * @param status 状態
   * @returns 足した行の ID
   */
  async function insertEntry(status = "waitlisted"): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind, status)
       VALUES ($1, '森 はるか', 'direct', 'self_page', $2) RETURNING id`,
      [eventId, status],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 打診を表に直に足す。
   * @param entryId 申込みの ID
   * @param values 状態・札・打診した人
   * @param values.status 状態
   * @param values.tokenHash 返事の札の SHA-256
   * @param values.offeredBy 手で打診した人
   * @returns 足した行の ID
   */
  async function insertOffer(
    entryId: string,
    values: { status?: string; tokenHash?: string | null; offeredBy?: string | null } = {},
  ): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_offer (event_id, entry_id, status, deadline, token_hash, offered_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        eventId,
        entryId,
        values.status ?? "pending",
        DEADLINE,
        values.tokenHash ?? null,
        values.offeredBy ?? null,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("打診を足せませんでした。");
    return id;
  }

  it("定員は空か1〜1000。新しい列の既定はどれも空", async () => {
    const row = await database.pool.query<Record<string, unknown>>(
      `SELECT capacity, quota_released_at, cancelled_at, notified_starts_at, notified_venue,
              change_detected_at, same_day_notified_at
       FROM booking_setting WHERE event_id = $1`,
      [eventId],
    );
    expect(Object.values(row.rows[0] ?? {}).every((value) => value === null)).toBe(true);
    for (const capacity of [1, 1000]) {
      await database.pool.query("UPDATE booking_setting SET capacity = $1 WHERE event_id = $2", [
        capacity,
        eventId,
      ]);
    }
    for (const capacity of [0, 1001]) {
      await expect(
        database.pool.query("UPDATE booking_setting SET capacity = $1 WHERE event_id = $2", [
          capacity,
          eventId,
        ]),
      ).rejects.toThrow(/booking_setting_capacity_check/);
    }
  });

  it("申込みの状態にキャンセル待ちと打診中が入る", async () => {
    const id = await insertEntry("waitlisted");
    await database.pool.query("UPDATE booking_entry SET status = 'offered' WHERE id = $1", [id]);
    expect(await countOf("SELECT count(*) AS n FROM booking_entry WHERE status = 'offered'")).toBe(
      1,
    );
  });

  it("枠は直接でない媒体ごとに1つ・席は1〜1000・URL は http(s) で500文字まで", async () => {
    /**
     * 枠を足す。
     * @param source 媒体
     * @param seats 席の数
     * @param url 管理ページの URL
     * @returns 結果
     */
    const insert = (source: string, seats: number, url: string | null = null) =>
      database.pool.query(
        "INSERT INTO booking_quota (event_id, application_source, seats, manage_url) VALUES ($1, $2, $3, $4)",
        [eventId, source, seats, url],
      );
    for (const source of QUOTA_SOURCES) await insert(source, 1, "https://example.com/manage");
    await database.pool.query("DELETE FROM booking_quota");
    await expect(insert("direct", 1)).rejects.toThrow(/booking_quota_application_source_check/);
    await expect(insert("peatix", 0)).rejects.toThrow(/booking_quota_seats_check/);
    await expect(insert("peatix", 1001)).rejects.toThrow(/booking_quota_seats_check/);
    await expect(insert("peatix", 1, "javascript:alert(1)")).rejects.toThrow(
      /booking_quota_manage_url_check/,
    );
    await expect(insert("peatix", 1, `https://example.com/${"a".repeat(500)}`)).rejects.toThrow(
      /booking_quota_manage_url_check/,
    );
    await insert("peatix", 4, "http://example.com/manage");
    await expect(insert("peatix", 2)).rejects.toThrow(
      /booking_quota_event_id_application_source_unique/,
    );
  });

  it("打診の状態の code はどれも入り、ほかは止まる。待っている打診は申込みごとに1つ", async () => {
    const entryId = await insertEntry("offered");
    for (const status of OFFER_STATUSES.filter((value) => value !== "pending")) {
      await insertOffer(entryId, { status });
    }
    await insertOffer(entryId);
    await expect(insertOffer(entryId)).rejects.toThrow(/booking_offer_entry_id_pending_unique/);
    await expect(insertOffer(entryId, { status: "queued" })).rejects.toThrow(
      /booking_offer_status_check/,
    );
  });

  it("返事の札は一意", async () => {
    await insertOffer(await insertEntry(), { tokenHash: HASH_A });
    await expect(insertOffer(await insertEntry(), { tokenHash: HASH_A })).rejects.toThrow(
      /booking_offer_token_hash_unique/,
    );
  });

  it("知らせの種類に当日の空きが入る", async () => {
    const entryId = await insertEntry();
    await database.pool.query(
      "INSERT INTO booking_notice (entry_id, kind, method, result) VALUES ($1, 'same_day', 'none', 'no_destination')",
      [entryId],
    );
    expect(await countOf("SELECT count(*) AS n FROM booking_notice")).toBe(1);
  });

  it("手で打診した主催者を消すと空になり、申込みを消すと打診が消える", async () => {
    const organizer = await loginAs(app, { displayName: "主催者" });
    const entryId = await insertEntry("offered");
    const offerId = await insertOffer(entryId, { offeredBy: organizer.account.id });
    await database.pool.query("DELETE FROM account WHERE id = $1", [organizer.account.id]);
    const after = await database.pool.query<{ offered_by: string | null }>(
      "SELECT offered_by FROM booking_offer WHERE id = $1",
      [offerId],
    );
    expect(after.rows[0]?.offered_by).toBeNull();
    await database.pool.query("DELETE FROM booking_entry WHERE id = $1", [entryId]);
    expect(await countOf("SELECT count(*) AS n FROM booking_offer")).toBe(0);
  });

  it("交流会を消すと、枠と打診が一緒に消える", async () => {
    await database.pool.query(
      "INSERT INTO booking_quota (event_id, application_source, seats) VALUES ($1, 'peatix', 4)",
      [eventId],
    );
    await insertOffer(await insertEntry("offered"));
    await database.pool.query("DELETE FROM event WHERE id = $1", [eventId]);
    expect(
      await countOf(
        "SELECT (SELECT count(*) FROM booking_quota) + (SELECT count(*) FROM booking_offer) AS n",
      ),
    ).toBe(0);
  });
});
