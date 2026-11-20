// 予約の表の結合のテスト（本物の PostgreSQL）：選択肢の CHECK と約束が食い違わない・当てたチェックインの一意・
// 消し方（交流会を消すと名簿も消える・チェックインを消すと当てが外れる・入れた人を消すと空・本人を消すと申込みも消える）。
// 窓口はまだないので、表に直に書いて確かめる（booking-001 の1つ目の PR）。
import "@hono/zod-openapi";
import { BOOKING_MODES, ENTRY_KINDS, ENTRY_STATUSES } from "@workspace/contracts/booking";
import { APPLICATION_SOURCES } from "@workspace/contracts/reception";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { checkIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

describe("予約の表", () => {
  let app: TestApp;
  let ownerId: string;
  let eventId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    const owner = await loginAs(app, { displayName: "持ち主" });
    ownerId = owner.account.id;
    eventId = (await createEvent(app, owner.cookie)).id;
  });

  /**
   * 名簿の行を表に直に足す。
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertEntry(values: Record<string, string | null> = {}): Promise<string> {
    const row = {
      event_id: eventId,
      name: "山田 花子",
      application_source: "other",
      entry_kind: "import",
      entered_by: null,
      account_id: null,
      checkin_id: null,
      ...values,
    };
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind, entered_by, account_id, checkin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        row.event_id,
        row.name,
        row.application_source,
        row.entry_kind,
        row.entered_by,
        row.account_id,
        row.checkin_id,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 名簿の行を読む。
   * @param id 行の ID
   * @returns 行（なければ undefined）
   */
  async function readEntry(
    id: string,
  ): Promise<{ status: string; checkin_id: string | null; entered_by: string | null } | undefined> {
    const result = await database.pool.query<{
      status: string;
      checkin_id: string | null;
      entered_by: string | null;
    }>("SELECT status, checkin_id, entered_by FROM booking_entry WHERE id = $1", [id]);
    return result.rows[0];
  }

  it("選択肢の code はどれも DB に入り、ほかの値は CHECK で止まる", async () => {
    for (const mode of BOOKING_MODES) {
      await database.pool.query(
        `INSERT INTO booking_setting (event_id, mode) VALUES ($1, $2)
         ON CONFLICT (event_id) DO UPDATE SET mode = excluded.mode`,
        [eventId, mode],
      );
    }
    for (const source of APPLICATION_SOURCES) {
      for (const kind of ENTRY_KINDS) {
        const id = await insertEntry({ application_source: source, entry_kind: kind });
        for (const status of ENTRY_STATUSES) {
          await database.pool.query("UPDATE booking_entry SET status = $1 WHERE id = $2", [
            status,
            id,
          ]);
        }
      }
    }
    await database.pool.query(
      `INSERT INTO booking_import_mapping (owner_account_id, header_key, name_column, application_source)
       SELECT $1, 'k' || s, '名前', s FROM unnest($2::text[]) AS s`,
      [ownerId, [...APPLICATION_SOURCES]],
    );
    await expect(
      database.pool.query("UPDATE booking_setting SET mode = 'waitlist' WHERE event_id = $1", [
        eventId,
      ]),
    ).rejects.toThrow(/booking_setting_mode_check/);
    await expect(insertEntry({ entry_kind: "external" })).rejects.toThrow(
      /booking_entry_entry_kind_check/,
    );
    await expect(insertEntry({ application_source: "kokuchpro" })).rejects.toThrow(
      /booking_entry_application_source_check/,
    );
    const id = await insertEntry();
    await expect(
      database.pool.query("UPDATE booking_entry SET status = 'pending' WHERE id = $1", [id]),
    ).rejects.toThrow(/booking_entry_status_check/);
    expect((await readEntry(id))?.status).toBe("confirmed");
  });

  it("1つのチェックインは1つの行にしか当てられない", async () => {
    const participant = await loginAs(app);
    const checkin = await checkIn(app, participant.cookie, eventId);
    await insertEntry({ checkin_id: checkin.checkin.id });
    await expect(insertEntry({ checkin_id: checkin.checkin.id })).rejects.toThrow(
      /booking_entry_checkin_id_unique/,
    );
  });

  it("チェックインを消すと当てが外れ、ちがう人の組は消える。入れた人を消すと空になる", async () => {
    const staff = await loginAs(app, { displayName: "受付係" });
    const participant = await loginAs(app);
    const checkin = await checkIn(app, participant.cookie, eventId);
    const matched = await insertEntry({
      checkin_id: checkin.checkin.id,
      entered_by: staff.account.id,
      entry_kind: "manual",
    });
    const other = await insertEntry();
    await database.pool.query(
      "INSERT INTO booking_dismissal (event_id, checkin_id, entry_id, dismissed_by) VALUES ($1, $2, $3, $4)",
      [eventId, checkin.checkin.id, other, staff.account.id],
    );

    await database.pool.query("DELETE FROM checkin WHERE id = $1", [checkin.checkin.id]);
    expect((await readEntry(matched))?.checkin_id).toBeNull();
    const dismissals = await database.pool.query("SELECT 1 FROM booking_dismissal");
    expect(dismissals.rowCount).toBe(0);

    await database.pool.query("DELETE FROM account WHERE id = $1", [staff.account.id]);
    expect((await readEntry(matched))?.entered_by).toBeNull();
  });

  it("本人のアカウントを消すと、その人の申込みも消える", async () => {
    const participant = await loginAs(app);
    const id = await insertEntry({ account_id: participant.account.id });
    await database.pool.query("DELETE FROM account WHERE id = $1", [participant.account.id]);
    expect(await readEntry(id)).toBeUndefined();
  });

  it("交流会を消すと、設定・名簿・ちがう人の組が一緒に消える", async () => {
    await database.pool.query(
      "INSERT INTO booking_setting (event_id, mode) VALUES ($1, 'roster')",
      [eventId],
    );
    await insertEntry();
    await database.pool.query("DELETE FROM event WHERE id = $1", [eventId]);
    const left = await database.pool.query<{ n: string }>(
      "SELECT (SELECT count(*) FROM booking_setting) + (SELECT count(*) FROM booking_entry) AS n",
    );
    expect(Number(left.rows[0]?.n)).toBe(0);
  });
});
