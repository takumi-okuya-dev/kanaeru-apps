// 参加者の連絡のメールアドレスの結合のテスト（booking-002 US4・research R14・S14）：本人が入れる・読む・消す・形の誤り・
// ほかの人の答え（設定・名簿）に出ない。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, useRoster } from "../../../test/helpers/booking.ts";
import { notifyBase, notifyConfig, saveLine } from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

describe("参加者の連絡のメールアドレス", () => {
  let app: TestApp;
  let participant: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    participant = await loginAs(app, { displayName: "参加者" });
  });

  it("本人が入れる（小文字にそろえる）・読む・置きかえる・消す", async () => {
    expect(
      await (await call(app, participant.cookie, "/api/v1/booking/me/contact")).json(),
    ).toEqual({ email: null });
    const saved = await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "Hanako@Example.com",
    });
    expect(await saved.json()).toEqual({ email: "hanako@example.com" });
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako2@example.com",
    });
    expect(
      await (await call(app, participant.cookie, "/api/v1/booking/me/contact")).json(),
    ).toEqual({
      email: "hanako2@example.com",
    });
    const removed = await call(app, participant.cookie, "/api/v1/booking/me/contact", "DELETE");
    expect(await removed.json()).toEqual({ email: null });
    const rows = await database.pool.query("SELECT 1 FROM booking_contact");
    expect(rows.rowCount).toBe(0);
  });

  it("形が違えば 400。未ログインは 401", async () => {
    expect(
      (
        await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
          email: "hanako",
        })
      ).status,
    ).toBe(400);
    expect((await call(app, "", "/api/v1/booking/me/contact")).status).toBe(401);
  });

  it("ほかの人には読めず、主催者の設定・名簿の答えに出ない", async () => {
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako@example.com",
    });
    const other = await loginAs(app, { displayName: "主催者" });
    expect(await (await call(app, other.cookie, "/api/v1/booking/me/contact")).json()).toEqual({
      email: null,
    });
    await saveLine(app, other.cookie);
    const settings = await (await call(app, other.cookie, notifyBase())).text();
    expect(settings).not.toContain("hanako@example.com");
    const eventId = (await createEvent(app, other.cookie)).id;
    await useRoster(app, other.cookie, eventId);
    await database.pool.query(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind, account_id)
       VALUES ($1, '山田 花子', 'other', 'manual', $2)`,
      [eventId, participant.account.id],
    );
    const roster = await (await call(app, other.cookie, `${bookingBase(eventId)}/entries`)).text();
    expect(roster).toContain("山田 花子");
    expect(roster).not.toContain("hanako@example.com");
  });
});
