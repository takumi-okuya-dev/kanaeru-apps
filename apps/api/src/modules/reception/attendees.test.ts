// 受付の index.ts がほかの領域・ほかのアプリに出す関数の結合のテスト（本物の PostgreSQL。booking-001 FR-B103・research R9）：
// チェックインした人（その交流会だけ・古い順）・「チェックインしたか」・手でのチェックインを作る（窓口と同じ金額と割引）。
import "@hono/zod-openapi";
import type { EventView } from "@workspace/contracts/event";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN, checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";
import { createManualCheckin, hasCheckedIn, listEventAttendees } from "./index.ts";

const database = useTestDatabase();

describe("受付の index.ts がほかに出す関数", () => {
  let app: TestApp;
  let organizer: { cookie: string; account: { id: string } };
  let event: EventView;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    organizer = await loginAs(app, { displayName: "主催者" });
    event = (await createEvent(app, organizer.cookie, {
      fee: 3000,
      discounts: [{ name: "紹介割", amount: 1000, asksReferrer: true }],
    })) as unknown as EventView;
  });

  it("チェックインした人は、その交流会のものだけを古い順に、名前・ID・アカウント・入れ方つきで返す", async () => {
    const other = await createEvent(app, organizer.cookie);
    const participant = await loginAs(app);
    const line = await checkIn(app, participant.cookie, event.id, { name: "LINE の人" });
    const manual = await manualCheckIn(app, organizer.cookie, event.id, { name: "手の人" });
    await manualCheckIn(app, organizer.cookie, other.id, { name: "別の交流会の人" });

    const attendees = await listEventAttendees(database.db, event.id);
    expect(
      attendees.map(({ checkinId, name, accountId, method }) => ({
        checkinId,
        name,
        accountId,
        method,
      })),
    ).toEqual([
      {
        checkinId: line.checkin.id,
        name: "LINE の人",
        accountId: participant.account.id,
        method: "line",
      },
      { checkinId: manual.id, name: "手の人", accountId: null, method: "manual" },
    ]);
    expect(attendees[0]?.checkedInAt).toBeInstanceOf(Date);
  });

  it("「チェックインしたか」は、その人のその交流会のチェックインだけを見る", async () => {
    const other = await createEvent(app, organizer.cookie);
    const participant = await loginAs(app);
    await checkIn(app, participant.cookie, other.id);
    expect(await hasCheckedIn(database.db, event.id, participant.account.id)).toBe(false);
    await checkIn(app, participant.cookie, event.id);
    expect(await hasCheckedIn(database.db, event.id, participant.account.id)).toBe(true);
  });

  it("手でのチェックインを作ると、入れた人と、参加費から割引を引いた金額が入る", async () => {
    const discountId = event.discounts[0]?.id ?? "";
    const record = await createManualCheckin(database.db, testConfig(), {
      eventId: event.id,
      enteredBy: organizer.account.id,
      input: { ...SAMPLE_CHECKIN, name: "飛び入りの人", discountId, referrerName: "紹介者" },
    });
    expect(record).toMatchObject({
      eventId: event.id,
      accountId: null,
      enteredBy: organizer.account.id,
      name: "飛び入りの人",
      amount: 2000,
      discountName: "紹介割",
      referrerName: "紹介者",
    });
  });

  it("手でのチェックインで、ない交流会や選べない割引は止める", async () => {
    await expect(
      createManualCheckin(database.db, testConfig(), {
        eventId: "0193a1b2-0000-7000-8000-000000000000",
        enteredBy: organizer.account.id,
        input: SAMPLE_CHECKIN,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createManualCheckin(database.db, testConfig(), {
        eventId: event.id,
        enteredBy: organizer.account.id,
        input: { ...SAMPLE_CHECKIN, discountId: "0193a1b2-0000-7000-8000-000000000001" },
      }),
    ).rejects.toMatchObject({ code: "DISCOUNT_UNAVAILABLE" });
  });
});
