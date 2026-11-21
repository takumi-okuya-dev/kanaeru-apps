// 主催者の申込みページの設定の結合のテスト（booking-003 US2）：使い方を自前にする・受付を開く・閉じる・見せる範囲・
// 組織に入れていないと部員だけを選べない・自前でないと 409・受付係と部員は変えられない・自前でなくすと受付が閉じる・
// 自前でも名簿の窓口が動く。名前は架空のもの。
import "@hono/zod-openapi";
import type { BookingSetting } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, readRoster } from "../../../test/helpers/booking.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

describe("申込みページの設定（主催者）", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie)).id;
    base = bookingBase(eventId);
  });

  it("使い方を自前にすると、受付は閉じていて誰でも。始まりの前で、組織には入れていない", async () => {
    const response = await call(app, owner.cookie, `${base}/setting`, "PUT", {
      mode: "self_page",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "self_page",
      entryCount: 0,
      accepting: false,
      visibility: "public",
      started: false,
      inOrganization: false,
    } satisfies BookingSetting);
  });

  it("受付を開く・閉じる。始まりを過ぎたら started", async () => {
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    const opened = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "public",
    });
    expect(((await opened.json()) as BookingSetting).accepting).toBe(true);
    const closed = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: false,
      visibility: "public",
    });
    expect(((await closed.json()) as BookingSetting).accepting).toBe(false);
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 hour' WHERE id = $1",
      [eventId],
    );
    const read = await call(app, owner.cookie, `${base}/setting`);
    expect(((await read.json()) as BookingSetting).started).toBe(true);
  });

  it("組織に入れていない交流会は部員だけにできない（400）。入れると選べる", async () => {
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    const denied = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "members",
    });
    expect(denied.status).toBe(400);
    expect(((await denied.json()) as ErrorBody).error.code).toBe(
      "BOOKING_VISIBILITY_NEEDS_ORGANIZATION",
    );
    const organizationId = await setUpOrganization(app, owner.cookie, []);
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    const allowed = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "members",
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ visibility: "members", inOrganization: true });
  });

  it("使い方が自前でなければ 409。入力の誤りは 400", async () => {
    const off = await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "public",
    });
    expect(off.status).toBe(409);
    expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_SELF_PAGE_OFF");
    const invalid = await call(app, owner.cookie, `${base}/self-page`, "PUT", { accepting: "yes" });
    expect(invalid.status).toBe(400);
  });

  it("受付係と部員は受付と見せる範囲を変えられない（403）", async () => {
    const member = await loginAs(app, { displayName: "部員" });
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: member.cookie, accountId: member.account.id, role: "member" },
    ]);
    await placeEvent(app, owner.cookie, eventId, organizationId);
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    const staff = await makeStaff(app, owner.cookie, eventId);
    const body = { accepting: true, visibility: "public" };
    expect((await call(app, staff.cookie, `${base}/self-page`, "PUT", body)).status).toBe(403);
    expect((await call(app, member.cookie, `${base}/self-page`, "PUT", body)).status).toBe(403);
  });

  it("使い方を自前でなくすと受付が閉じ、自前に戻しても閉じたまま", async () => {
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    await call(app, owner.cookie, `${base}/self-page`, "PUT", {
      accepting: true,
      visibility: "public",
    });
    const roster = await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "roster" });
    expect(((await roster.json()) as BookingSetting).accepting).toBe(false);
    const back = await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    expect(((await back.json()) as BookingSetting).accepting).toBe(false);
  });

  it("自前の交流会でも、名簿の窓口（取り込み・名簿）が動く", async () => {
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "self_page" });
    await importNames(app, owner.cookie, eventId, ["山田 花子"]);
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries.map((entry) => entry.name)).toEqual(["山田 花子"]);
  });
});
