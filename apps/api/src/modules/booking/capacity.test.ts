// 定員と媒体の枠の結合のテスト（booking-004 US1・research R1〜R3・S9・S12）：保存・席の内訳・満員と止める媒体・枠を押さえるのを
// やめる・超えた人数・入力の誤り・役目・使い方。名前はどれも架空のもの。
import "@hono/zod-openapi";
import type { BookingSetting } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, useRoster } from "../../../test/helpers/booking.ts";
import { apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { notifyConfig } from "../../../test/helpers/booking-notify.ts";
import { setCapacity } from "../../../test/helpers/booking-waitlist.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** 枠の見本（架空の管理ページ）。 */
const PEATIX = { applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/manage" };

describe("定員と媒体の枠", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    base = bookingBase(eventId);
    await openSelfPage(app, owner.cookie, eventId);
  });

  /**
   * 設定を読む。
   * @returns 設定
   */
  async function readSetting(): Promise<BookingSetting> {
    return (await (await call(app, owner.cookie, `${base}/setting`)).json()) as BookingSetting;
  }

  it("定員と枠を保存すると、設定に席の内訳が出る", async () => {
    const response = await call(app, owner.cookie, `${base}/capacity`, "PUT", {
      capacity: 16,
      quotas: [PEATIX],
    });
    expect(response.status).toBe(200);
    const setting = (await response.json()) as BookingSetting;
    expect(setting.capacity).toBe(16);
    expect(setting.quotas).toEqual([PEATIX]);
    expect(setting.seats).toMatchObject({
      capacity: 16,
      filled: 0,
      selfRemaining: 12,
      full: false,
      over: 0,
      stopSources: [],
    });
  });

  it("枠の残りを押さえ、満員になったら止める媒体を出して枠を押さえるのをやめる", async () => {
    await setCapacity(app, owner.cookie, eventId, 4, [{ ...PEATIX, seats: 2 }]);
    await importNames(app, owner.cookie, eventId, ["森 一", "林 二"], "direct");
    await importNames(app, owner.cookie, eventId, ["石井 三"], "peatix");
    let setting = await readSetting();
    expect(setting.seats).toMatchObject({ filled: 3, selfRemaining: 0, full: false });
    expect(setting.seats?.quotas[0]).toMatchObject({ filled: 1, remaining: 1 });

    await importNames(app, owner.cookie, eventId, ["上田 四"], "peatix");
    setting = await readSetting();
    expect(setting.seats).toMatchObject({ filled: 4, full: true, quotasReleased: true });
    expect(setting.seats?.stopSources).toEqual([
      { applicationSource: "peatix", manageUrl: PEATIX.manageUrl },
    ]);
  });

  it("取り込みで定員を超えても取り消さず、超えた人数を出す", async () => {
    await setCapacity(app, owner.cookie, eventId, 2);
    await importNames(app, owner.cookie, eventId, ["森 一", "林 二", "石井 三"], "other");
    const setting = await readSetting();
    expect(setting.seats).toMatchObject({ filled: 3, over: 1, full: true });
    expect(setting.entryCount).toBe(3);
  });

  it("入力の誤りは 400（枠の合計・定員なしで枠・直接・同じ媒体・URL・範囲）", async () => {
    const bad = [
      { capacity: 3, quotas: [PEATIX] },
      { capacity: null, quotas: [PEATIX] },
      { capacity: 10, quotas: [{ ...PEATIX, applicationSource: "direct" }] },
      { capacity: 10, quotas: [PEATIX, PEATIX] },
      { capacity: 10, quotas: [{ ...PEATIX, manageUrl: "javascript:alert(1)" }] },
      { capacity: 0, quotas: [] },
      { capacity: 1001, quotas: [] },
    ];
    for (const input of bad) {
      const response = await call(app, owner.cookie, `${base}/capacity`, "PUT", input);
      expect(response.status).toBe(400);
    }
  });

  it("受付係と部員でない人は 403。受付だけなら 409", async () => {
    const staff = await makeStaff(app, owner.cookie, eventId);
    const denied = await call(app, staff.cookie, `${base}/capacity`, "PUT", {
      capacity: 5,
      quotas: [],
    });
    expect(denied.status).toBe(403);
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "reception" });
    const off = await call(app, owner.cookie, `${base}/capacity`, "PUT", {
      capacity: 5,
      quotas: [],
    });
    expect(off.status).toBe(409);
    expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_ROSTER_OFF");
  });

  it("名簿を使う交流会でも定員を入れられ、目安と超えた人数だけを出す", async () => {
    const other = (await createEvent(app, owner.cookie, { name: "勉強会" })).id;
    await useRoster(app, owner.cookie, other);
    await setCapacity(app, owner.cookie, other, 1);
    await importNames(app, owner.cookie, other, ["森 一", "林 二"], "other");
    const setting = (await (
      await call(app, owner.cookie, `${bookingBase(other)}/setting`)
    ).json()) as BookingSetting;
    expect(setting.seats).toMatchObject({ filled: 2, over: 1 });
    expect(setting.change).toBeNull();
  });

  it("定員がなければ、申し込んだ人はみな確定する（booking-003 と同じ）", async () => {
    const participant = await loginAs(app, { displayName: "中村" });
    const response = await apply(app, participant.cookie, eventId);
    expect(response.status).toBe(201);
    expect(((await response.json()) as { entry: { status: string } }).entry.status).toBe(
      "confirmed",
    );
    expect((await readSetting()).seats).toBeNull();
  });
});
