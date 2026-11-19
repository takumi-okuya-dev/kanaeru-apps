// ほかの領域（survey）が index.ts から使う関数：findCheckin・getCheckin・listCheckins（本物の PostgreSQL）。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";
import { findCheckin, getCheckin, listCheckins } from "./index.ts";

const database = useTestDatabase();

/** ない ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

describe("受付の入口がほかの領域に出す関数", () => {
  let app: TestApp;
  let organizer: string;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    organizer = (await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })).cookie;
  });

  it("findCheckin はその人のその交流会のチェックインだけを返す", async () => {
    const event = await createEvent(app, organizer);
    const other = await createEvent(app, organizer, { name: "別の交流会" });
    const participant = await loginAs(app);
    const { checkin } = await checkIn(app, participant.cookie, event.id, { name: "佐藤" });

    const found = await findCheckin(database.db, event.id, participant.account.id);
    expect(found).toMatchObject({
      id: checkin.id,
      eventId: event.id,
      accountId: participant.account.id,
      enteredBy: null,
      name: "佐藤",
      paymentMethod: "paypay",
      amount: 1000,
    });
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(await findCheckin(database.db, other.id, participant.account.id)).toBeNull();
  });

  it("getCheckin は ID で読み、なければ null", async () => {
    const event = await createEvent(app, organizer);
    const row = await manualCheckIn(app, organizer, event.id, { name: "手の人" });
    expect(await getCheckin(database.db, row.id)).toMatchObject({
      id: row.id,
      accountId: null,
      name: "手の人",
    });
    expect(await getCheckin(database.db, MISSING_ID)).toBeNull();
  });

  it("listCheckins はその交流会のチェックインを新しい順に返す", async () => {
    const event = await createEvent(app, organizer);
    const other = await createEvent(app, organizer, { name: "別の交流会" });
    await manualCheckIn(app, organizer, event.id, { name: "1人目" });
    await manualCheckIn(app, organizer, other.id, { name: "別の交流会の人" });
    await manualCheckIn(app, organizer, event.id, { name: "2人目" });
    expect((await listCheckins(database.db, event.id)).map((row) => row.name)).toEqual([
      "2人目",
      "1人目",
    ]);
  });
});
