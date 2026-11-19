// 割引のチェックインの結合のテスト（本物の PostgreSQL。reception-002）：金額の決まり（参加費 − 割引・0で止める・無料は0）・
// 写し（あとで割引や参加費を直しても変わらない）・直すと決め直す（支払い方法・割引）・選べない割引・紹介者の名前（主催者だけ）・
// 内訳と CSV。
import "@hono/zod-openapi";
import type { EventView } from "@workspace/contracts/event";
import type {
  CheckinBreakdown,
  CheckinList,
  CheckinTotals,
  CheckinView,
  MyCheckinResult,
} from "@workspace/contracts/reception";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { SAMPLE_EVENT, call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN, checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

describe("割引のチェックイン", () => {
  let app: TestApp;
  let organizer: string;
  let event: EventView;
  let referralId: string;
  let studentId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    organizer = (
      await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST, displayName: "主催者" })
    ).cookie;
    event = (await createEvent(app, organizer, {
      fee: 5000,
      discounts: [
        { name: "紹介割", amount: 1000, asksReferrer: true },
        { name: "学割", amount: 6000 },
      ],
    })) as unknown as EventView;
    referralId = event.discounts[0]?.id ?? "";
    studentId = event.discounts[1]?.id ?? "";
    base = `/api/v1/events/${event.id}/checkins`;
  });

  /**
   * 交流会を直す（参加費と割引）。
   * @param input 替える欄
   */
  async function updateEvent(input: Record<string, unknown>): Promise<void> {
    const response = await call(app, organizer, `/api/v1/events/${event.id}`, "PUT", {
      ...SAMPLE_EVENT,
      ...input,
    });
    expect(response.status).toBe(200);
  }

  /**
   * チェックインを直す。
   * @param cookie クッキー
   * @param checkinId チェックインの ID
   * @param input 入力（足りない欄は見本）
   * @returns 直した行
   */
  async function edit(
    cookie: string,
    checkinId: string,
    input: Record<string, unknown>,
  ): Promise<CheckinView> {
    const response = await call(app, cookie, `${base}/${checkinId}`, "PUT", {
      ...SAMPLE_CHECKIN,
      ...input,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as CheckinView;
  }

  /**
   * 一覧を読む。
   * @param cookie クッキー
   * @returns 一覧の行
   */
  async function listOf(cookie: string): Promise<CheckinView[]> {
    return ((await (await call(app, cookie, base)).json()) as CheckinList).checkins;
  }

  describe("金額の決まり", () => {
    it("参加費 5,000円の交流会で紹介割を選ぶと 4,000円。割引の名前と額を写し、合計も 4,000円", async () => {
      const participant = await loginAs(app, { displayName: "佐藤 太郎" });
      const result = await checkIn(app, participant.cookie, event.id, {
        discountId: referralId,
        referrerName: " 田中 花子 ",
      });
      expect(result.checkin).toMatchObject({
        amount: 4000,
        discountId: referralId,
        discountName: "紹介割",
        discountAmount: 1000,
      });
      // 参加者の自分のチェックインには紹介者の名前を返さない
      expect(result.checkin).not.toHaveProperty("referrerName");

      const totals = (await (await call(app, organizer, `${base}/totals`)).json()) as CheckinTotals;
      expect(totals.byPaymentMethod[0]).toEqual({
        paymentMethod: "paypay",
        count: 1,
        amount: 4000,
      });
      expect(totals.total).toEqual({ count: 1, amount: 4000 });
    });

    it("割引が参加費より大きければ0円・無料は割引があっても0円・割引なしは参加費", async () => {
      const student = await manualCheckIn(app, organizer, event.id, { discountId: studentId });
      expect(student.amount).toBe(0);
      const free = await manualCheckIn(app, organizer, event.id, {
        paymentMethod: "free",
        discountId: referralId,
      });
      expect(free.amount).toBe(0);
      const plain = await manualCheckIn(app, organizer, event.id, { discountId: null });
      expect(plain).toMatchObject({ amount: 5000, discountId: null, discountName: null });
    });

    it("あとで割引の額や参加費を直しても、すでにあるチェックインの金額と写しは変わらない", async () => {
      const created = await manualCheckIn(app, organizer, event.id, { discountId: referralId });
      await updateEvent({
        fee: 8000,
        discounts: [
          { id: referralId, name: "紹介割（新）", amount: 2000, asksReferrer: true },
          { id: studentId, name: "学割", amount: 6000 },
        ],
      });
      const [row] = await listOf(organizer);
      expect(row).toMatchObject({
        id: created.id,
        amount: 4000,
        discountName: "紹介割",
        discountAmount: 1000,
      });
      // 名前だけ直しても、金額・写しは変わらない
      const renamed = await edit(organizer, created.id, {
        name: "別の名前",
        discountId: referralId,
      });
      expect(renamed).toMatchObject({ amount: 4000, discountName: "紹介割", discountAmount: 1000 });
    });

    it("割引を変えずに支払い方法を直すと、写した割引の額と今の参加費で決め直す", async () => {
      const created = await manualCheckIn(app, organizer, event.id, { discountId: referralId });
      await updateEvent({
        fee: 8000,
        discounts: [{ id: referralId, name: "紹介割", amount: 2000, asksReferrer: true }],
      });
      const cash = await edit(organizer, created.id, {
        paymentMethod: "cash",
        discountId: referralId,
      });
      expect(cash).toMatchObject({ amount: 7000, discountAmount: 1000 });
      const free = await edit(organizer, created.id, {
        paymentMethod: "free",
        discountId: referralId,
      });
      expect(free.amount).toBe(0);
    });

    it("割引を変えると、その割引の今の名前と額を写して決め直す。割引なしにすると参加費", async () => {
      const created = await manualCheckIn(app, organizer, event.id);
      expect(created.amount).toBe(5000);
      const discounted = await edit(organizer, created.id, { discountId: referralId });
      expect(discounted).toMatchObject({
        amount: 4000,
        discountName: "紹介割",
        discountAmount: 1000,
      });
      const student = await edit(organizer, created.id, { discountId: studentId });
      expect(student).toMatchObject({ amount: 0, discountName: "学割", discountAmount: 6000 });
      const none = await edit(organizer, created.id, { discountId: null });
      expect(none).toMatchObject({ amount: 5000, discountId: null, discountAmount: null });
    });
  });

  describe("選べる割引", () => {
    it("使うのをやめた割引・ほかの交流会の割引は 400 DISCOUNT_UNAVAILABLE（割引の設問の誤り）", async () => {
      const other = (await createEvent(app, organizer, {
        discounts: [{ name: "他", amount: 100 }],
      })) as unknown as EventView;
      await updateEvent({
        fee: 5000,
        discounts: [{ id: referralId, name: "紹介割", amount: 1000, asksReferrer: true }],
      });
      for (const discountId of [studentId, other.discounts[0]?.id]) {
        const response = await call(app, organizer, base, "POST", {
          ...SAMPLE_CHECKIN,
          discountId,
        });
        expect(response.status).toBe(400);
        const body = (await response.json()) as ErrorBody;
        expect(body.error.code).toBe("DISCOUNT_UNAVAILABLE");
        expect(body.error.fields?.[0]?.path).toBe("discountId");
      }
      const participant = await loginAs(app);
      const mine = await call(app, participant.cookie, `${base}/me`, "POST", {
        ...SAMPLE_CHECKIN,
        discountId: studentId,
      });
      expect(mine.status).toBe(400);
    });

    it("使うのをやめた割引のチェックインも、割引を変えなければ直せる（別の使っていない割引には変えられない）", async () => {
      const created = await manualCheckIn(app, organizer, event.id, { discountId: studentId });
      await updateEvent({
        fee: 5000,
        discounts: [{ id: referralId, name: "紹介割", amount: 1000, asksReferrer: true }],
      });
      const kept = await edit(organizer, created.id, { name: "直した", discountId: studentId });
      expect(kept).toMatchObject({ name: "直した", discountName: "学割", amount: 0 });

      const switched = await call(app, organizer, `${base}/${created.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        discountId: "0193a1b2-0000-7000-8000-000000000000",
      });
      expect(switched.status).toBe(400);
    });
  });

  describe("紹介者の名前（主催者だけが読む）", () => {
    it("受付係が入れた紹介者の名前は、受付係の答え・一覧には出ず、主催者の一覧には出る", async () => {
      const staff = await makeStaff(app, organizer, event.id);
      const created = await manualCheckIn(app, staff.cookie, event.id, {
        discountId: referralId,
        referrerName: "田中 花子",
      });
      expect(created.referrerName).toBeNull();
      expect((await listOf(staff.cookie))[0]?.referrerName).toBeNull();
      expect((await listOf(organizer))[0]?.referrerName).toBe("田中 花子");
    });

    it("受付係が紹介者を送らずに直しても残り、送れば置きかわる。割引を変えれば空になる", async () => {
      const staff = await makeStaff(app, organizer, event.id);
      const created = await manualCheckIn(app, organizer, event.id, {
        discountId: referralId,
        referrerName: "田中 花子",
      });
      const edited = await edit(staff.cookie, created.id, {
        paymentMethod: "cash",
        discountId: referralId,
      });
      expect(edited.referrerName).toBeNull();
      expect((await listOf(organizer))[0]?.referrerName).toBe("田中 花子");

      await edit(staff.cookie, created.id, { discountId: referralId, referrerName: "鈴木 一郎" });
      expect((await listOf(organizer))[0]?.referrerName).toBe("鈴木 一郎");

      await edit(organizer, created.id, { discountId: studentId });
      expect((await listOf(organizer))[0]?.referrerName).toBeNull();
    });

    it("主催者は空・null で消せる。割引なしなら送っても記録しない", async () => {
      const created = await manualCheckIn(app, organizer, event.id, {
        discountId: referralId,
        referrerName: "田中 花子",
      });
      const cleared = await edit(organizer, created.id, {
        discountId: referralId,
        referrerName: "",
      });
      expect(cleared.referrerName).toBeNull();

      const none = await manualCheckIn(app, organizer, event.id, { referrerName: "田中 花子" });
      expect(none.referrerName).toBeNull();
      const result = await database.pool.query<{ referrer_name: string | null }>(
        "SELECT referrer_name FROM checkin WHERE id = $1",
        [none.id],
      );
      expect(result.rows[0]?.referrer_name).toBeNull();
    });
  });

  describe("内訳と CSV（主催者だけ）", () => {
    it("割引ごとの人数と割引の額の合計（無料を除く）・割引なし・紹介者ごとの人数", async () => {
      const participant = await loginAs(app);
      await checkIn(app, participant.cookie, event.id, {
        discountId: referralId,
        referrerName: "田中 花子",
      });
      await manualCheckIn(app, organizer, event.id, {
        discountId: referralId,
        referrerName: " 田中　花子",
      });
      await manualCheckIn(app, organizer, event.id, {
        discountId: referralId,
        referrerName: "鈴木",
        paymentMethod: "free",
      });
      await manualCheckIn(app, organizer, event.id);
      const response = await call(app, organizer, `${base}/breakdown`);
      expect(response.status).toBe(200);
      const breakdown = (await response.json()) as CheckinBreakdown;
      expect(breakdown.discounts).toEqual([
        { discountId: referralId, name: "紹介割", active: true, count: 3, discountTotal: 2000 },
        { discountId: studentId, name: "学割", active: true, count: 0, discountTotal: 0 },
        { discountId: null, name: null, active: true, count: 1, discountTotal: 0 },
      ]);
      expect(breakdown.referrers).toEqual([
        { name: "田中 花子", count: 2 },
        { name: "鈴木", count: 1 },
      ]);
    });

    it("使うのをやめた割引は、使われていれば active: false で残り、使われていなければ出ない", async () => {
      await manualCheckIn(app, organizer, event.id, { discountId: studentId });
      await updateEvent({ fee: 5000, discounts: [] });
      const breakdown = (await (
        await call(app, organizer, `${base}/breakdown`)
      ).json()) as CheckinBreakdown;
      expect(breakdown.discounts.map(({ name, active, count }) => [name, active, count])).toEqual([
        ["学割", false, 1],
        [null, true, 0],
      ]);
    });

    it("CSV に割引・割引の額・紹介者の列。受付係は内訳も CSV も 403", async () => {
      const participant = await loginAs(app, { displayName: "佐藤" });
      const result: MyCheckinResult = await checkIn(app, participant.cookie, event.id, {
        name: "佐藤",
        discountId: referralId,
        referrerName: "田中 花子",
      });
      expect(result.checkin.amount).toBe(4000);
      const response = await call(app, organizer, `${base}/export`);
      const lines = new TextDecoder()
        .decode(new Uint8Array(await response.arrayBuffer()).slice(3))
        .split("\r\n");
      expect(lines[0]).toContain(",金額,割引,割引の額,紹介者,");
      expect(lines[1]).toMatch(/^佐藤,.+,PayPay,4000,紹介割,1000,田中 花子,LINE,$/);

      const staff = await makeStaff(app, organizer, event.id);
      expect((await call(app, staff.cookie, `${base}/breakdown`)).status).toBe(403);
      expect((await call(app, staff.cookie, `${base}/export`)).status).toBe(403);
    });
  });
});
