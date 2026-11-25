// 自分の申込み・取り消す・部の予定・案内の同意の結合のテスト（booking-003 US3・research R7・R9・R19・S9・S11）。名前は架空のもの。
import "@hono/zod-openapi";
import type {
  ApplyResult,
  ConsentList,
  MyEntryItem,
  MyEntryList,
  MySchedule,
} from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { readRoster, useRoster } from "../../../test/helpers/booking.ts";
import { anonymous, apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { notifyConfig } from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

describe("自分の申込み・部の予定・案内の同意", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let participant: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    owner = await loginAs(app, { displayName: "高橋" });
    participant = await loginAs(app, { displayName: "中村" });
  });

  /**
   * 受付を開いた交流会を作り、参加者が申し込む。
   * @param name 交流会の名前
   * @param daysLater 何日あとに始まるか
   * @returns 交流会と申込みの ID
   */
  async function appliedEvent(
    name: string,
    daysLater: number,
  ): Promise<{ eventId: string; entryId: string }> {
    const startsAt = new Date(Date.now() + daysLater * DAY_MS).toISOString();
    const eventId = (await createEvent(app, owner.cookie, { name, startsAt })).id;
    await openSelfPage(app, owner.cookie, eventId);
    const result = (await (await apply(app, participant.cookie, eventId)).json()) as ApplyResult;
    return { eventId, entryId: result.entry.id };
  }

  it("始まりの日が終わっていない会だけを、始まりの近い順に出す（主催・取り消せるか・カレンダー）", async () => {
    const later = await appliedEvent("遠い会", 10);
    const sooner = await appliedEvent("近い会", 3);
    const past = await appliedEvent("過ぎた会", 5);
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '3 days' WHERE id = $1",
      [past.eventId],
    );
    const response = await call(app, participant.cookie, "/api/v1/booking/me/entries");
    expect(response.status).toBe(200);
    const { entries } = (await response.json()) as MyEntryList;
    expect(entries.map((item) => item.event.name)).toEqual(["近い会", "遠い会"]);
    expect(entries[0]).toMatchObject({
      entryId: sooner.entryId,
      status: "confirmed",
      cancellable: true,
      hostName: "高橋",
    });
    expect(entries[1]?.entryId).toBe(later.entryId);
    expect(entries[0]?.googleCalendarUrl).toContain("https://calendar.google.com/");
    // ほかの人の申込みは出ない
    const other = await loginAs(app);
    const theirs = (await (
      await call(app, other.cookie, "/api/v1/booking/me/entries")
    ).json()) as MyEntryList;
    expect(theirs.entries).toEqual([]);
  });

  it("取り消すと、名簿でも取り消しになる。2回目は同じ答え。ほかの人の行は 404", async () => {
    const { eventId, entryId } = await appliedEvent("練習", 3);
    const path = `/api/v1/booking/me/entries/${entryId}/cancel`;
    const other = await loginAs(app);
    const denied = await call(app, other.cookie, path, "POST");
    expect(denied.status).toBe(404);
    expect(((await denied.json()) as ErrorBody).error.code).toBe("BOOKING_ENTRY_NOT_FOUND");
    const response = await call(app, participant.cookie, path, "POST");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      entryId,
      status: "cancelled",
      cancellable: false,
    } satisfies Partial<MyEntryItem>);
    expect((await call(app, participant.cookie, path, "POST")).status).toBe(200);
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries[0]?.status).toBe("cancelled");
  });

  it("始まりを過ぎたら取り消せない（409）。ログインしていなければ 401", async () => {
    const { eventId, entryId } = await appliedEvent("練習", 3);
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 hour' WHERE id = $1",
      [eventId],
    );
    const response = await call(
      app,
      participant.cookie,
      `/api/v1/booking/me/entries/${entryId}/cancel`,
      "POST",
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorBody).error.code).toBe("BOOKING_CANCEL_CLOSED");
    expect((await anonymous(app, "/api/v1/booking/me/entries")).status).toBe(401);
  });

  it("部の予定：自分の組織の自前の会（部員だけの回も）だけを、状態と自分の申込みつきで出す", async () => {
    const organizationId = await setUpOrganization(
      app,
      owner.cookie,
      [{ cookie: participant.cookie, accountId: participant.account.id, role: "member" }],
      "バドミントンの部",
    );
    const otherOrg = await setUpOrganization(app, owner.cookie, [], "ほかの部");
    const create = async (name: string, org: string | null, mode: "self_page" | "roster") => {
      const id = (await createEvent(app, owner.cookie, { name })).id;
      if (org) await placeEvent(app, owner.cookie, id, org);
      if (mode === "self_page") {
        await openSelfPage(app, owner.cookie, id, {
          visibility: name === "部員の練習" ? "members" : "public",
        });
      } else {
        await useRoster(app, owner.cookie, id);
      }
      return id;
    };
    const open = await create("部員の練習", organizationId, "self_page");
    await create("名簿だけの会", organizationId, "roster");
    await create("ほかの部の会", otherOrg, "self_page");
    await create("個人の会", null, "self_page");
    await apply(app, participant.cookie, open);

    const response = await call(app, participant.cookie, "/api/v1/booking/me/schedule");
    expect(response.status).toBe(200);
    const { events } = (await response.json()) as MySchedule;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: { id: open, name: "部員の練習" },
      hostName: "バドミントンの部",
      state: "open",
      visibility: "members",
      myStatus: "confirmed",
    });
  });

  it("案内の同意の一覧と外す（本人のものだけ。ほかの人の同意は 404）", async () => {
    const { eventId } = await appliedEvent("練習", 3);
    await apply(app, participant.cookie, eventId, { name: "中村", consent: true });
    const list = (await (
      await call(app, participant.cookie, "/api/v1/booking/me/consents")
    ).json()) as ConsentList;
    expect(list.consents).toEqual([
      { id: expect.any(String) as string, holderName: "高橋", holderKind: "personal" },
    ]);
    const consentId = list.consents[0]?.id ?? "";
    const other = await loginAs(app);
    const denied = await call(
      app,
      other.cookie,
      `/api/v1/booking/me/consents/${consentId}`,
      "DELETE",
    );
    expect(denied.status).toBe(404);
    const removed = await call(
      app,
      participant.cookie,
      `/api/v1/booking/me/consents/${consentId}`,
      "DELETE",
    );
    expect(removed.status).toBe(204);
    const after = (await (
      await call(app, participant.cookie, "/api/v1/booking/me/consents")
    ).json()) as ConsentList;
    expect(after.consents).toEqual([]);
  });
});
