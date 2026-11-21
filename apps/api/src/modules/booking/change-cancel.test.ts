// 日時や場所の変更の知らせと予約の中止の結合のテスト（booking-004 US6・research R10・R11・S9・S11）。
// event の窓口で交流会を直し、booking が「最後に知らせた日時と場所」と比べて知らせることを確かめる。名前はどれも架空のもの。
import "@hono/zod-openapi";
import type { ApplyPage, BookingSetting } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase } from "../../../test/helpers/booking.ts";
import { anonymous, apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { notifyConfig } from "../../../test/helpers/booking-notify.ts";
import {
  TEST_JOB_SECRET,
  noticeKinds,
  setCapacity,
  statusOf,
  tick,
} from "../../../test/helpers/booking-waitlist.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { SAMPLE_EVENT, call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

describe("変更と中止の知らせ", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig({}, { jobTriggerSecret: TEST_JOB_SECRET }));
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    base = bookingBase(eventId);
    await openSelfPage(app, owner.cookie, eventId);
  });

  /**
   * 参加者として申し込み、申込みの ID を返す。
   * @param displayName 表示名
   * @returns 申込みの ID
   */
  async function join(displayName: string): Promise<string> {
    const person = await loginAs(app, { displayName });
    const response = await apply(app, person.cookie, eventId, { name: displayName });
    return ((await response.json()) as { entry: { id: string } }).entry.id;
  }

  /**
   * 交流会の日時と場所を直す（event の窓口）。
   * @param values 日時と場所
   * @param values.startsAt 日時
   * @param values.venue 場所
   */
  async function editEvent(values: { startsAt?: string; venue?: string }): Promise<void> {
    const response = await call(app, owner.cookie, `/api/v1/events/${eventId}`, "PUT", {
      ...SAMPLE_EVENT,
      name: "土曜の練習",
      ...values,
    });
    expect(response.status).toBe(200);
  }

  /**
   * 設定を読む。
   * @returns 設定
   */
  async function readSetting(): Promise<BookingSetting> {
    return (await (await call(app, owner.cookie, `${base}/setting`)).json()) as BookingSetting;
  }

  it("日時を直すと設定に変更が出て、知らせると取り消しでない人に前の日時つきの変更を送る", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const confirmed = await join("中村 さき");
    const waiting = await join("森 はるか");
    const gone = await join("林 たろう");
    await database.pool.query("UPDATE booking_entry SET status = 'cancelled' WHERE id = $1", [
      gone,
    ]);
    expect((await readSetting()).change).toBeNull();

    const next = new Date(Date.now() + 8 * DAY_MS).toISOString();
    await editEvent({ startsAt: next });
    const setting = await readSetting();
    expect(setting.change).toMatchObject({
      startsAt: next,
      previousVenue: SAMPLE_EVENT.venue,
      venue: SAMPLE_EVENT.venue,
      autoNoticeAt: null,
    });

    const response = await call(app, owner.cookie, `${base}/change-notice`, "POST", {
      notify: true,
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as BookingSetting).change).toBeNull();
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed", "changed"]);
    expect(await noticeKinds(database, waiting)).toEqual(["waitlisted", "changed"]);
    expect(await noticeKinds(database, gone)).toEqual(["waitlisted"]);

    const again = await call(app, owner.cookie, `${base}/change-notice`, "POST", { notify: true });
    expect(again.status).toBe(409);
    expect(((await again.json()) as ErrorBody).error.code).toBe("BOOKING_NO_CHANGE");
  });

  it("知らせずに済ませると送らずに変更が消える", async () => {
    const confirmed = await join("中村 さき");
    await editEvent({ venue: "新しい体育館" });
    expect((await readSetting()).change).toMatchObject({ venue: "新しい体育館" });
    const response = await call(app, owner.cookie, `${base}/change-notice`, "POST", {
      notify: false,
    });
    expect(response.status).toBe(200);
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed"]);
    expect((await readSetting()).change).toBeNull();
  });

  it("定期の仕事は変更に気づいて30分たってから1回だけ知らせる。戻ったら気づきを消す", async () => {
    const confirmed = await join("中村 さき");
    await editEvent({ venue: "新しい体育館" });
    expect(await (await tick(app)).json()).toMatchObject({ changed: 0 });
    expect((await readSetting()).change?.autoNoticeAt).not.toBeNull();
    expect(await (await tick(app)).json()).toMatchObject({ changed: 0 });
    await database.pool.query(
      "UPDATE booking_setting SET change_detected_at = now() - interval '31 minutes' WHERE event_id = $1",
      [eventId],
    );
    expect(await (await tick(app)).json()).toMatchObject({ changed: 1 });
    expect(await (await tick(app)).json()).toMatchObject({ changed: 0 });
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed", "changed"]);

    // 変えてすぐ戻したら、気づきを消して知らせない
    await editEvent({ venue: "もう一つの体育館" });
    await tick(app);
    await editEvent({ venue: "新しい体育館" });
    await tick(app);
    const detected = await database.pool.query<{ change_detected_at: Date | null }>(
      "SELECT change_detected_at FROM booking_setting WHERE event_id = $1",
      [eventId],
    );
    expect(detected.rows[0]?.change_detected_at).toBeNull();
  });

  it("始まったあとに交流会を直しても、変更を知らせず帯も出さない（知らせた日時と場所を今にそろえるだけ）", async () => {
    const confirmed = await join("中村 さき");
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 hour', venue = '直した会場' WHERE id = $1",
      [eventId],
    );
    expect((await readSetting()).change).toBeNull();
    await database.pool.query(
      "UPDATE booking_setting SET change_detected_at = now() - interval '31 minutes' WHERE event_id = $1",
      [eventId],
    );
    expect(await (await tick(app)).json()).toMatchObject({ changed: 0 });
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed"]);
    const notified = await database.pool.query<{
      notified_venue: string | null;
      change_detected_at: Date | null;
    }>("SELECT notified_venue, change_detected_at FROM booking_setting WHERE event_id = $1", [
      eventId,
    ]);
    expect(notified.rows).toEqual([{ notified_venue: "直した会場", change_detected_at: null }]);
    const resolve = await call(app, owner.cookie, `${base}/change-notice`, "POST", {
      notify: true,
    });
    expect(resolve.status).toBe(409);
  });

  it("交流会の日にちが変わったら、当日の空きの知らせと枠を押さえるのをやめる印を戻す", async () => {
    await join("中村 さき");
    await database.pool.query(
      "UPDATE booking_setting SET same_day_notified_at = now(), quota_released_at = now() WHERE event_id = $1",
      [eventId],
    );
    await editEvent({ startsAt: new Date(Date.now() + 9 * DAY_MS).toISOString() });
    expect(
      (await call(app, owner.cookie, `${base}/change-notice`, "POST", { notify: false })).status,
    ).toBe(200);
    const reset = await database.pool.query<{
      same_day_notified_at: Date | null;
      quota_released_at: Date | null;
    }>("SELECT same_day_notified_at, quota_released_at FROM booking_setting WHERE event_id = $1", [
      eventId,
    ]);
    expect(reset.rows).toEqual([{ same_day_notified_at: null, quota_released_at: null }]);
  });

  it("キャンセル待ち・打診中の人がいると使い方を自前から外せない（409）。外して戻すと、外していた間の変更は知らせない", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    await join("中村 さき");
    const waiting = await join("森 はるか");
    const blocked = await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "roster" });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as ErrorBody).error.code).toBe("BOOKING_WAITLIST_ACTIVE");
    await call(app, owner.cookie, `${base}/entries/${waiting}/status`, "PUT", {
      status: "cancelled",
    });
    expect(
      (await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "roster" })).status,
    ).toBe(200);
    await editEvent({ venue: "外していた間の会場" });
    expect(
      (await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" })).status,
    ).toBe(200);
    expect((await readSetting()).change).toBeNull();
  });

  it("予約を中止すると、取り消しでない申込みを取り消しにして中止を知らせ、ページは中止になる", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const confirmed = await join("中村 さき");
    const waiting = await join("森 はるか");
    const response = await call(app, owner.cookie, `${base}/cancel-booking`, "POST");
    expect(response.status).toBe(200);
    expect(((await response.json()) as BookingSetting).cancelled).toBe(true);
    expect(await statusOf(database, confirmed)).toBe("cancelled");
    expect(await statusOf(database, waiting)).toBe("cancelled");
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed", "cancelled_event"]);
    expect(await noticeKinds(database, waiting)).toEqual(["waitlisted", "cancelled_event"]);
    const page = (await (await anonymous(app, `${base}/page`)).json()) as ApplyPage;
    expect(page.state).toBe("cancelled");

    const person = await loginAs(app, { displayName: "林 たろう" });
    const late = await apply(app, person.cookie, eventId, { name: "林 たろう" });
    expect(late.status).toBe(409);
    expect(((await late.json()) as ErrorBody).error.code).toBe("BOOKING_EVENT_CANCELLED");
    const reopen = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "public",
    });
    expect(reopen.status).toBe(409);
    // 2回目は同じ答えで、知らせを重ねない
    expect((await call(app, owner.cookie, `${base}/cancel-booking`, "POST")).status).toBe(200);
    expect(await noticeKinds(database, confirmed)).toEqual(["confirmed", "cancelled_event"]);
    // 中止のあとは変更の帯を出さない
    await editEvent({ venue: "新しい体育館" });
    expect((await readSetting()).change).toBeNull();
  });

  it("受付係は変更の知らせ・中止を使えない。自前でなければ 409", async () => {
    const staff = await makeStaff(app, owner.cookie, eventId);
    expect((await call(app, staff.cookie, `${base}/cancel-booking`, "POST")).status).toBe(403);
    expect(
      (await call(app, staff.cookie, `${base}/change-notice`, "POST", { notify: true })).status,
    ).toBe(403);
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "roster" });
    const off = await call(app, owner.cookie, `${base}/cancel-booking`, "POST");
    expect(off.status).toBe(409);
    expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_SELF_PAGE_OFF");
  });
});
