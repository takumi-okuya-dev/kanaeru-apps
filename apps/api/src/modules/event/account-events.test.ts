// 交流会の index.ts が人物メモに出す関数の結合のテスト（本物の PostgreSQL。AD-31）：
// その人が持ち主か受付係の交流会と、渡した ID の交流会を、名前と始まりだけでまとめて返す。組織の役割は数えない。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs, testLineUserId } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { listAccountEventSummaries } from "./index.ts";

const database = useTestDatabase();

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 今から days 日あとの日時（ISO の文字）。
 * @param days 日数
 * @returns 日時
 */
function daysLater(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

describe("その人が持ち主か受付係の交流会と、渡した ID の交流会（listAccountEventSummaries）", () => {
  let app: TestApp;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
  });

  it("持ち主・受付係・渡した ID の交流会を、始まりの新しい順に、名前と始まりだけで返す", async () => {
    const myLineUserId = testLineUserId();
    const me = await loginAs(app, { lineUserId: myLineUserId, displayName: "わたし" });
    const other = await loginAs(app, { displayName: "ほかの主催者" });
    const owned = await createEvent(app, me.cookie, { name: "自分の会", startsAt: daysLater(3) });
    const staffed = await createEvent(app, other.cookie, {
      name: "受付係の会",
      startsAt: daysLater(5),
    });
    const checkedIn = await createEvent(app, other.cookie, {
      name: "参加した会",
      startsAt: daysLater(1),
    });
    await createEvent(app, other.cookie, { name: "関係のない会", startsAt: daysLater(2) });
    const staff = await makeStaff(app, other.cookie, staffed.id, { lineUserId: myLineUserId });
    expect(staff.account.id).toBe(me.account.id);

    const rows = await listAccountEventSummaries(database.db, me.account.id, [checkedIn.id]);
    expect(rows).toEqual([
      { eventId: staffed.id, name: "受付係の会", startsAt: new Date(staffed.startsAt) },
      { eventId: owned.id, name: "自分の会", startsAt: new Date(owned.startsAt) },
      { eventId: checkedIn.id, name: "参加した会", startsAt: new Date(checkedIn.startsAt) },
    ]);
    // 渡した ID がなければ、参加した会は入らない
    expect(
      (await listAccountEventSummaries(database.db, me.account.id, [])).map((row) => row.eventId),
    ).toEqual([staffed.id, owned.id]);
  });

  it("持ち主で、受付係で、渡した ID にも入っている交流会は1つだけ返す", async () => {
    const me = await loginAs(app);
    const owned = await createEvent(app, me.cookie, { name: "自分の会" });
    const rows = await listAccountEventSummaries(database.db, me.account.id, [owned.id, owned.id]);
    expect(rows.map((row) => row.eventId)).toEqual([owned.id]);
  });

  it("組織の役割（管理者・編集者・部員）だけの交流会は数えない", async () => {
    const admin = await loginAs(app, { displayName: "組織の管理者" });
    const editor = await loginAs(app, { displayName: "編集者" });
    const member = await loginAs(app, { displayName: "部員" });
    const owner = await loginAs(app, { displayName: "交流会の持ち主" });
    const organizationId = await setUpOrganization(app, admin.cookie, [
      { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
      { cookie: member.cookie, accountId: member.account.id, role: "member" },
      { cookie: owner.cookie, accountId: owner.account.id, role: "editor" },
    ]);
    const placed = await createEvent(app, owner.cookie, { name: "組織の会" });
    expect((await placeEvent(app, owner.cookie, placed.id, organizationId)).status).toBe(200);

    for (const person of [admin, editor, member]) {
      expect(await listAccountEventSummaries(database.db, person.account.id, [])).toEqual([]);
    }
    expect(
      (await listAccountEventSummaries(database.db, owner.account.id, [])).map(
        (row) => row.eventId,
      ),
    ).toEqual([placed.id]);
  });

  it("ない交流会の ID と、uuid の形でない文字を渡しても、何も足さず止まらない", async () => {
    const me = await loginAs(app);
    const owned = await createEvent(app, me.cookie, { name: "自分の会" });
    expect(
      (
        await listAccountEventSummaries(database.db, me.account.id, [
          "00000000-0000-7000-8000-000000000000",
          "abc",
        ])
      ).map((row) => row.eventId),
    ).toEqual([owned.id]);
  });
});
