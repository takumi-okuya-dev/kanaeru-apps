// 割引の結合のテスト（本物の PostgreSQL。reception-002）：交流会と一緒に作る・直す・外す（消さない）・送らなければ変えない・
// ない ID・受付係は直せない・交流会と要約と一覧に出る・index.ts の findEventDiscount・listEventDiscounts。
import "@hono/zod-openapi";
import type { EventList, EventSummary, EventView } from "@workspace/contracts/event";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { SAMPLE_EVENT, call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { findEventDiscount, listEventDiscounts } from "./index.ts";

const database = useTestDatabase();

/** ない割引の ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

describe("割引", () => {
  let app: TestApp;
  let organizer: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    organizer = (
      await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST, displayName: "主催者" })
    ).cookie;
  });

  /**
   * 交流会を直す（ほかの欄は見本のまま）。
   * @param eventId 交流会の ID
   * @param input 足す欄
   * @returns 応答
   */
  function update(eventId: string, input: Record<string, unknown>): Promise<Response> {
    return call(app, organizer, `/api/v1/events/${eventId}`, "PUT", { ...SAMPLE_EVENT, ...input });
  }

  it("交流会と一緒に作り、交流会・要約・一覧に作った順で出る（紹介者は送らなければ聞かない）", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [
        { name: "紹介割", amount: 1000, asksReferrer: true },
        { name: "学割", amount: 500 },
      ],
    })) as unknown as EventView;
    expect(
      created.discounts.map(({ name, amount, asksReferrer }) => [name, amount, asksReferrer]),
    ).toEqual([
      ["紹介割", 1000, true],
      ["学割", 500, false],
    ]);
    for (const discount of created.discounts) expect(discount.id).toMatch(/^[0-9a-f-]{36}$/);

    const participant = await loginAs(app, { displayName: "参加者" });
    const summary = await call(app, participant.cookie, `/api/v1/events/${created.id}/summary`);
    expect(((await summary.json()) as EventSummary).discounts).toEqual(created.discounts);

    const list = await call(app, organizer, "/api/v1/events");
    expect(((await list.json()) as EventList).events[0]?.discounts).toEqual(created.discounts);
  });

  it("割引のない交流会は空の並び", async () => {
    const created = (await createEvent(app, organizer)) as unknown as EventView;
    expect(created.discounts).toEqual([]);
  });

  it("id のある行は直し、ない行は足し、並びにない割引は消さずに使うのをやめる", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [
        { name: "紹介割", amount: 1000 },
        { name: "学割", amount: 500 },
      ],
    })) as unknown as EventView;
    const [referral, student] = created.discounts;
    if (!referral || !student) throw new Error("割引ができていません。");

    const response = await update(created.id, {
      discounts: [
        { id: referral.id, name: "紹介割", amount: 1500, asksReferrer: true },
        { name: "早割", amount: 300 },
      ],
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as EventView;
    expect(
      updated.discounts.map(({ name, amount, asksReferrer }) => [name, amount, asksReferrer]),
    ).toEqual([
      ["紹介割", 1500, true],
      ["早割", 300, false],
    ]);
    expect(updated.discounts[0]?.id).toBe(referral.id);

    // 学割は消えずに残り、使うのをやめた印が付く（チェックインの写しの外部キーを宙に浮かせない）
    const all = await listEventDiscounts(database.db, created.id);
    expect(all.map(({ name, active }) => [name, active])).toEqual([
      ["紹介割", true],
      ["学割", false],
      ["早割", true],
    ]);
    expect(await findEventDiscount(database.db, created.id, student.id)).toMatchObject({
      name: "学割",
      amount: 500,
      active: false,
    });
  });

  it("discounts を送らなければ割引は変えない・空の並びはすべて使うのをやめる", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [{ name: "紹介割", amount: 1000 }],
    })) as unknown as EventView;
    const kept = (await (await update(created.id, { fee: 2000 })).json()) as EventView;
    expect(kept.discounts.map((discount) => discount.name)).toEqual(["紹介割"]);

    const cleared = (await (await update(created.id, { discounts: [] })).json()) as EventView;
    expect(cleared.discounts).toEqual([]);
    expect((await listEventDiscounts(database.db, created.id)).length).toBe(1);
  });

  it("使うのをやめた割引も、id を送ればまた使う", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [{ name: "紹介割", amount: 1000 }],
    })) as unknown as EventView;
    const id = created.discounts[0]?.id;
    await update(created.id, { discounts: [] });
    const revived = (await (
      await update(created.id, { discounts: [{ id, name: "紹介割", amount: 1000 }] })
    ).json()) as EventView;
    expect(revived.discounts.map((discount) => discount.id)).toEqual([id]);
  });

  it("ほかの交流会の割引・ない割引の id は 400 DISCOUNT_NOT_FOUND で、何も変えない", async () => {
    const other = (await createEvent(app, organizer, {
      discounts: [{ name: "他の割引", amount: 100 }],
    })) as unknown as EventView;
    const created = (await createEvent(app, organizer, {
      discounts: [{ name: "紹介割", amount: 1000 }],
    })) as unknown as EventView;
    for (const id of [other.discounts[0]?.id, MISSING_ID]) {
      const response = await update(created.id, {
        name: "名前を変える",
        discounts: [{ id, name: "x", amount: 1 }],
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.code).toBe("DISCOUNT_NOT_FOUND");
    }
    const unchanged = await call(app, organizer, `/api/v1/events/${created.id}`);
    const body = (await unchanged.json()) as EventView;
    expect(body.name).toBe(SAMPLE_EVENT.name);
    expect(body.discounts.map((discount) => discount.name)).toEqual(["紹介割"]);
  });

  it("入力の誤り（同じ名前・0円）は 400 で、欄の道つき", async () => {
    const created = await createEvent(app, organizer);
    const response = await update(created.id, {
      discounts: [
        { name: "紹介割", amount: 1000 },
        { name: "紹介割", amount: 0 },
      ],
    });
    expect(response.status).toBe(400);
    const fields = ((await response.json()) as ErrorBody).error.fields?.map((field) => field.path);
    expect(fields).toEqual(expect.arrayContaining(["discounts.1.name", "discounts.1.amount"]));
  });

  it("受付係は割引を直せない（403）が、交流会の答えで使っている割引を読める", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [{ name: "紹介割", amount: 1000 }],
    })) as unknown as EventView;
    const staff = await makeStaff(app, organizer, created.id);
    const response = await call(app, staff.cookie, `/api/v1/events/${created.id}`, "PUT", {
      ...SAMPLE_EVENT,
      discounts: [],
    });
    expect(response.status).toBe(403);
    const view = await call(app, staff.cookie, `/api/v1/events/${created.id}`);
    expect(((await view.json()) as EventView).discounts.map((discount) => discount.name)).toEqual([
      "紹介割",
    ]);
  });

  it("findEventDiscount は、ほかの交流会の割引を返さない", async () => {
    const created = (await createEvent(app, organizer, {
      discounts: [{ name: "紹介割", amount: 1000 }],
    })) as unknown as EventView;
    const other = await createEvent(app, organizer);
    const id = created.discounts[0]?.id ?? MISSING_ID;
    expect(await findEventDiscount(database.db, other.id, id)).toBeNull();
    expect(await findEventDiscount(database.db, created.id, id)).toMatchObject({
      eventId: created.id,
      active: true,
      asksReferrer: false,
    });
  });
});
