// 「部員だけ」の回の招待のリンク（AD-5・AD-23・research R8。2026-11-21 主催者が決めた）の結合のテスト。
// event の要約の窓口は、ログインした誰でも名前・会場・参加費を読めるまま、GoogleフォームとLINEグループのリンクだけを、
// 交流会の役目のある人（主催者・受付係・部員）に絞る。名前はどれも架空のもの。
import "@hono/zod-openapi";
import type { EventSummary } from "@workspace/contracts/event";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase } from "../../../test/helpers/booking.ts";
import { openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

const FORM_URL = "https://forms.gle/members-only-example";
const GROUP_URL = "https://line.me/R/ti/g/members-only-example";

describe("部員だけの回の招待のリンク（交流会の要約）", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let member: Awaited<ReturnType<typeof loginAs>>;
  let outsider: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database);
    owner = await loginAs(app, { displayName: "高橋" });
    member = await loginAs(app, { displayName: "森" });
    outsider = await loginAs(app, { displayName: "中村 さき" });
    eventId = (
      await createEvent(app, owner.cookie, {
        name: "土曜の練習",
        fee: 500,
        googleFormUrl: FORM_URL,
        lineGroupUrl: GROUP_URL,
      })
    ).id;
  });

  /**
   * 要約を読む。
   * @param cookie クッキー
   * @returns 要約
   */
  async function readSummary(cookie: string): Promise<EventSummary> {
    const response = await call(app, cookie, `/api/v1/events/${eventId}/summary`);
    expect(response.status).toBe(200);
    return (await response.json()) as EventSummary;
  }

  /**
   * 組織に入れて、部員だけで受付を開く。
   */
  async function makeMembersOnly(): Promise<void> {
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: member.cookie, accountId: member.account.id, role: "member" },
    ]);
    await placeEvent(app, owner.cookie, eventId, organizationId);
    await openSelfPage(app, owner.cookie, eventId, { visibility: "members" });
  }

  it("予約の設定がない交流会は、誰にでもリンクを返す（今までどおり）", async () => {
    expect(await readSummary(outsider.cookie)).toMatchObject({
      googleFormUrl: FORM_URL,
      lineGroupUrl: GROUP_URL,
    });
  });

  it("誰でもの回は、組織の外の人にもリンクを返す", async () => {
    await openSelfPage(app, owner.cookie, eventId, { visibility: "public" });
    expect(await readSummary(outsider.cookie)).toMatchObject({
      googleFormUrl: FORM_URL,
      lineGroupUrl: GROUP_URL,
    });
  });

  it("部員だけの回は、組織の外の人にリンクを返さず、名前・会場・参加費・割引は返す", async () => {
    await makeMembersOnly();
    const summary = await readSummary(outsider.cookie);
    expect(summary).toMatchObject({
      id: eventId,
      name: "土曜の練習",
      venue: "渋谷の会場",
      fee: 500,
      googleFormUrl: null,
      lineGroupUrl: null,
    });
    expect(summary.discounts).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain("members-only-example");
  });

  it("部員だけの回でも、主催者・部員・受付係（組織の外の助っ人）にはリンクを返す", async () => {
    await makeMembersOnly();
    const staff = await makeStaff(app, owner.cookie, eventId);
    for (const cookie of [owner.cookie, member.cookie, staff.cookie]) {
      expect(await readSummary(cookie)).toMatchObject({
        googleFormUrl: FORM_URL,
        lineGroupUrl: GROUP_URL,
      });
    }
  });

  it("誰でもに戻すと、組織の外の人にもまたリンクを返す（要求のたびに決まりを引く）", async () => {
    await makeMembersOnly();
    expect((await readSummary(outsider.cookie)).lineGroupUrl).toBeNull();
    const reopened = await call(app, owner.cookie, `${bookingBase(eventId)}/self-page`, "PUT", {
      accepting: true,
      visibility: "public",
    });
    expect(reopened.status).toBe(200);
    expect((await readSummary(outsider.cookie)).lineGroupUrl).toBe(GROUP_URL);
  });
});
