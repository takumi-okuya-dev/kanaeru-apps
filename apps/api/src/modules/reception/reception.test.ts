// 受付の窓口の結合のテスト（本物の PostgreSQL）：自分のチェックイン（初期値・作る・二重を防ぐ）・一覧（同じ名前の印・手の印）・
// 手でのチェックイン・直す（金額の決まり）・取り消す・合計・内訳・CSV・権限・account を消したとき（CASCADE・SET NULL）。
// 約束の zod の形は、@hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つ。
// このファイルは約束の値（選択肢の並び）を先に読むので、先に @hono/zod-openapi を読む（kernel/errors.ts と同じ）。
import "@hono/zod-openapi";
import type {
  CheckinBreakdown,
  CheckinList,
  CheckinTotals,
  CheckinView,
  MyCheckinResult,
  MyCheckinState,
} from "@workspace/contracts/reception";
import { APPLICATION_SOURCES, PAYMENT_METHODS, REFERRALS } from "@workspace/contracts/reception";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { SAMPLE_EVENT, call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN, checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

/** ない交流会・チェックインの ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * チェックインの表の行の数を数える。
 * @returns 行の数
 */
async function countCheckins(): Promise<number> {
  const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM checkin");
  return Number(result.rows[0]?.count);
}

describe("受付の窓口", () => {
  let app: TestApp;
  let organizer: string;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    organizer = (
      await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST, displayName: "主催者" })
    ).cookie;
    eventId = (await createEvent(app, organizer, { fee: 1000 })).id;
    base = `/api/v1/events/${eventId}/checkins`;
  });

  /**
   * 一覧を読む。
   * @param cookie クッキー
   * @returns チェックインの一覧
   */
  async function listOf(cookie: string): Promise<CheckinView[]> {
    const response = await call(app, cookie, base);
    expect(response.status).toBe(200);
    return ((await response.json()) as CheckinList).checkins;
  }

  /**
   * 合計を読む。
   * @param cookie クッキー
   * @returns 支払い方法ごとの合計
   */
  async function totalsOf(cookie: string): Promise<CheckinTotals> {
    const response = await call(app, cookie, `${base}/totals`);
    expect(response.status).toBe(200);
    return (await response.json()) as CheckinTotals;
  }

  describe("自分のチェックイン", () => {
    it("初めての人は、名前の初期値が表示名で、知ったきっかけは空・チェックインは null", async () => {
      const participant = await loginAs(app, { displayName: "佐藤 太郎" });
      const response = await call(app, participant.cookie, `${base}/me`);
      expect(response.status).toBe(200);
      expect((await response.json()) as MyCheckinState).toEqual({
        checkin: null,
        prefill: { name: "佐藤 太郎", referral: null },
      });
    });

    it("チェックインすると 201 で、金額は参加費。読み直すとチェックイン済み", async () => {
      const participant = await loginAs(app);
      const response = await call(app, participant.cookie, `${base}/me`, "POST", SAMPLE_CHECKIN);
      expect(response.status).toBe(201);
      const created = (await response.json()) as MyCheckinResult;
      expect(created).toMatchObject({
        alreadyCheckedIn: false,
        checkin: { ...SAMPLE_CHECKIN, amount: 1000 },
      });
      const state = (await (
        await call(app, participant.cookie, `${base}/me`)
      ).json()) as MyCheckinState;
      expect(state.checkin).toEqual(created.checkin);
    });

    it("無料なら金額は0円", async () => {
      const participant = await loginAs(app);
      const result = await checkIn(app, participant.cookie, eventId, { paymentMethod: "free" });
      expect(result.checkin.amount).toBe(0);
    });

    it("2回目は記録を増やさず、すでにあるものを 200 で返す（同時に送っても1つ）", async () => {
      const participant = await loginAs(app);
      const first = await checkIn(app, participant.cookie, eventId);
      const second = await call(app, participant.cookie, `${base}/me`, "POST", {
        ...SAMPLE_CHECKIN,
        paymentMethod: "cash",
      });
      expect(second.status).toBe(200);
      expect((await second.json()) as MyCheckinResult).toEqual({
        checkin: first.checkin,
        alreadyCheckedIn: true,
      });

      const other = await loginAs(app);
      const results = await Promise.all(
        [1, 2, 3].map(() => call(app, other.cookie, `${base}/me`, "POST", SAMPLE_CHECKIN)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
      expect(await countCheckins()).toBe(2);
    });

    it("2回目以降の交流会では、前回の名前と知ったきっかけが初期値になる", async () => {
      const participant = await loginAs(app, { displayName: "LINE の名前" });
      await checkIn(app, participant.cookie, eventId, { name: "佐藤", referral: "sns" });
      const next = await createEvent(app, organizer, { name: "12月の交流会" });
      const state = (await (
        await call(app, participant.cookie, `/api/v1/events/${next.id}/checkins/me`)
      ).json()) as MyCheckinState;
      expect(state).toEqual({ checkin: null, prefill: { name: "佐藤", referral: "sns" } });
    });

    it("入力の誤りは 400 と欄ごとの日本語の理由で、作られない", async () => {
      const participant = await loginAs(app);
      const response = await call(app, participant.cookie, `${base}/me`, "POST", { name: " " });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields).toEqual([
        { path: "name", message: "名前を入れてください。" },
        { path: "applicationSource", message: "申し込みの媒体を選んでください。" },
        { path: "referral", message: "知ったきっかけを選んでください。" },
        { path: "paymentMethod", message: "支払い方法を選んでください。" },
      ]);
      expect(await countCheckins()).toBe(0);
    });

    it("ない交流会・形の違う ID は 404、未ログインは 401", async () => {
      const participant = await loginAs(app);
      const missing = `/api/v1/events/${MISSING_ID}/checkins/me`;
      expect((await call(app, participant.cookie, missing)).status).toBe(404);
      expect((await call(app, participant.cookie, missing, "POST", SAMPLE_CHECKIN)).status).toBe(
        404,
      );
      expect((await call(app, participant.cookie, "/api/v1/events/x/checkins/me")).status).toBe(
        404,
      );
      expect((await app.request(`${base}/me`)).status).toBe(401);
    });

    it("選択肢の code はどれも DB に入る（CHECK と約束が食い違わない）", async () => {
      const staff = await makeStaff(app, organizer, eventId);
      for (const applicationSource of APPLICATION_SOURCES) {
        for (const referral of REFERRALS) {
          for (const paymentMethod of PAYMENT_METHODS) {
            await manualCheckIn(app, staff.cookie, eventId, {
              applicationSource,
              referral,
              paymentMethod,
            });
          }
        }
      }
      expect(await countCheckins()).toBe(
        APPLICATION_SOURCES.length * REFERRALS.length * PAYMENT_METHODS.length,
      );
    });
  });

  describe("一覧と手でのチェックイン", () => {
    it("受付係が手でチェックインすると、手の印と入れた人が付き、新しい順に並ぶ", async () => {
      const staff = await makeStaff(app, organizer, eventId, { displayName: "受付係の山田" });
      const participant = await loginAs(app);
      await checkIn(app, participant.cookie, eventId, { name: "LINE の人" });
      const manual = await manualCheckIn(app, staff.cookie, eventId, {
        name: "手の人",
        paymentMethod: "cash",
      });
      expect(manual).toMatchObject({
        name: "手の人",
        method: "manual",
        accountId: null,
        enteredByName: "受付係の山田",
        amount: 1000,
        sameName: false,
      });

      const list = await listOf(organizer);
      expect(list.map((row) => row.name)).toEqual(["手の人", "LINE の人"]);
      expect(list[1]).toMatchObject({
        method: "line",
        accountId: participant.account.id,
        enteredByName: null,
      });
      expect(await listOf(staff.cookie)).toEqual(list);
    });

    it("同じ名前の印：手と LINE・手どうしは付け、LINE どうしは付けない（空白と全角半角はそろえる）", async () => {
      const a = await loginAs(app);
      const b = await loginAs(app);
      const c = await loginAs(app);
      await checkIn(app, a.cookie, eventId, { name: "佐藤 太郎" });
      // 手でのチェックインの答えの行も、同じ交流会の同じ名前と比べた印を持つ（DB でそろえた名前を探す）
      expect(await manualCheckIn(app, organizer, eventId, { name: "佐藤太郎　" })).toMatchObject({
        sameName: true,
      });
      await checkIn(app, b.cookie, eventId, { name: "鈴木" });
      await checkIn(app, c.cookie, eventId, { name: "鈴木" });
      expect(await manualCheckIn(app, organizer, eventId, { name: "ﾀﾅｶ" })).toMatchObject({
        sameName: false,
      });
      expect(await manualCheckIn(app, organizer, eventId, { name: "タナカ" })).toMatchObject({
        sameName: true,
      });
      const alone = await manualCheckIn(app, organizer, eventId, { name: "一人だけ" });
      expect(alone.sameName).toBe(false);

      const flags = Object.fromEntries(
        (await listOf(organizer)).map((row) => [`${row.name}/${row.method}`, row.sameName]),
      );
      expect(flags).toEqual({
        "佐藤 太郎/line": true,
        "佐藤太郎/manual": true,
        "鈴木/line": false,
        "ﾀﾅｶ/manual": true,
        "タナカ/manual": true,
        "一人だけ/manual": false,
      });

      // 直したあとの答えの行も、直した名前で比べる（ほかの交流会の同じ名前とは比べない）
      const other = await createEvent(app, organizer, { name: "別の交流会" });
      await manualCheckIn(app, organizer, other.id, { name: "山田" });
      const renamed = await call(app, organizer, `${base}/${alone.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        name: "山田",
      });
      expect(await renamed.json()).toMatchObject({ name: "山田", sameName: false });
      const toSuzuki = await call(app, organizer, `${base}/${alone.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        name: " 鈴\u3000木 ",
      });
      expect(await toSuzuki.json()).toMatchObject({ name: "鈴\u3000木", sameName: true });
    });

    it("主催者でも受付係でもない人は 403、ない交流会は 404、未ログインは 401", async () => {
      const other = await loginAs(app);
      expect((await call(app, other.cookie, base)).status).toBe(403);
      expect((await call(app, other.cookie, base, "POST", SAMPLE_CHECKIN)).status).toBe(403);
      expect((await call(app, other.cookie, `${base}/totals`)).status).toBe(403);
      expect((await call(app, organizer, `/api/v1/events/${MISSING_ID}/checkins`)).status).toBe(
        404,
      );
      expect((await app.request(base)).status).toBe(401);
      expect(await countCheckins()).toBe(0);
    });

    it("手でのチェックインの入力の誤りは 400", async () => {
      const response = await call(app, organizer, base, "POST", {
        ...SAMPLE_CHECKIN,
        referral: "tv",
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields).toEqual([
        { path: "referral", message: "知ったきっかけを選んでください。" },
      ]);
    });
  });

  describe("直す・取り消す・合計", () => {
    it("支払い方法を直すと金額を決め直し、合計がすぐ変わる", async () => {
      const staff = await makeStaff(app, organizer, eventId);
      const row = await manualCheckIn(app, staff.cookie, eventId);
      await manualCheckIn(app, staff.cookie, eventId, { name: "現金の人", paymentMethod: "cash" });
      expect((await totalsOf(staff.cookie)).byPaymentMethod).toEqual([
        { paymentMethod: "paypay", count: 1, amount: 1000 },
        { paymentMethod: "cash", count: 1, amount: 1000 },
        { paymentMethod: "free", count: 0, amount: 0 },
      ]);

      const toFree = await call(app, staff.cookie, `${base}/${row.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        paymentMethod: "free",
      });
      expect(toFree.status).toBe(200);
      expect(await toFree.json()).toMatchObject({ paymentMethod: "free", amount: 0 });
      expect(await totalsOf(organizer)).toEqual({
        byPaymentMethod: [
          { paymentMethod: "paypay", count: 0, amount: 0 },
          { paymentMethod: "cash", count: 1, amount: 1000 },
          { paymentMethod: "free", count: 1, amount: 0 },
        ],
        total: { count: 2, amount: 1000 },
      });
    });

    it("参加費を直したあと：名前だけ直しても金額は前のまま、支払い方法を直すと今の参加費", async () => {
      const row = await manualCheckIn(app, organizer, eventId);
      const updated = await call(app, organizer, `/api/v1/events/${eventId}`, "PUT", {
        ...SAMPLE_EVENT,
        fee: 1500,
      });
      expect(updated.status).toBe(200);

      const renamed = await call(app, organizer, `${base}/${row.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        name: "直した名前",
      });
      expect(await renamed.json()).toMatchObject({ name: "直した名前", amount: 1000 });

      const toCash = await call(app, organizer, `${base}/${row.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        name: "直した名前",
        paymentMethod: "cash",
      });
      expect(await toCash.json()).toMatchObject({ paymentMethod: "cash", amount: 1500 });
      expect((await totalsOf(organizer)).total).toEqual({ count: 1, amount: 1500 });
    });

    it("取り消すと行が消え、一覧と合計から外れる。もう一度は 404", async () => {
      const staff = await makeStaff(app, organizer, eventId);
      const row = await manualCheckIn(app, staff.cookie, eventId);
      const removed = await call(app, staff.cookie, `${base}/${row.id}`, "DELETE");
      expect(removed.status).toBe(204);
      expect(await countCheckins()).toBe(0);
      expect(await listOf(organizer)).toEqual([]);
      expect((await totalsOf(organizer)).total).toEqual({ count: 0, amount: 0 });
      const again = await call(app, staff.cookie, `${base}/${row.id}`, "DELETE");
      expect(again.status).toBe(404);
      expect(((await again.json()) as ErrorBody).error.code).toBe("CHECKIN_NOT_FOUND");
    });

    it("別の交流会のチェックインは、直せず取り消せない（404）", async () => {
      const other = await createEvent(app, organizer, { name: "別の交流会" });
      const row = await manualCheckIn(app, organizer, other.id);
      const put = await call(app, organizer, `${base}/${row.id}`, "PUT", SAMPLE_CHECKIN);
      expect(put.status).toBe(404);
      expect((await call(app, organizer, `${base}/${row.id}`, "DELETE")).status).toBe(404);
      expect((await call(app, organizer, `${base}/${MISSING_ID}`, "DELETE")).status).toBe(404);
      expect(await countCheckins()).toBe(1);
    });

    it("ない交流会の直す・取り消すは event の NOT_FOUND で、窓口の文書の 404 には両方の code を書く", async () => {
      const row = await manualCheckIn(app, organizer, eventId);
      const missing = `/api/v1/events/${MISSING_ID}/checkins/${row.id}`;
      for (const method of ["PUT", "DELETE"] as const) {
        const response = await call(app, organizer, missing, method, SAMPLE_CHECKIN);
        expect(response.status).toBe(404);
        expect(((await response.json()) as ErrorBody).error.code).toBe("NOT_FOUND");
      }

      const documented = buildApp(
        database,
        testConfig({
          organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST,
          openApiDocEnabled: true,
        }),
      );
      type NotFoundDoc = {
        content: Record<string, { examples: Record<string, { value: ErrorBody }> }>;
      };
      const document = (await (await documented.request("/api/openapi.json")).json()) as {
        paths: Record<string, Record<string, { responses: Record<string, NotFoundDoc> }>>;
      };
      const path = document.paths["/api/v1/events/{eventId}/checkins/{checkinId}"];
      for (const method of ["put", "delete"]) {
        const notFound = path?.[method]?.responses["404"]?.content["application/json"];
        const codes = Object.values(notFound?.examples ?? {}).map((item) => item.value.error.code);
        expect(codes.sort(), method).toEqual(["CHECKIN_NOT_FOUND", "NOT_FOUND"]);
      }
    });

    it("主催者でも受付係でもない人は、直せず取り消せない（403）", async () => {
      const row = await manualCheckIn(app, organizer, eventId);
      const other = await loginAs(app);
      expect(
        (await call(app, other.cookie, `${base}/${row.id}`, "PUT", SAMPLE_CHECKIN)).status,
      ).toBe(403);
      expect((await call(app, other.cookie, `${base}/${row.id}`, "DELETE")).status).toBe(403);
    });
  });

  describe("主催者だけのもの（内訳・CSV）", () => {
    it("内訳は選択肢の順で0人も出し、合計はチェックインの数と同じ", async () => {
      const participant = await loginAs(app);
      await checkIn(app, participant.cookie, eventId);
      await manualCheckIn(app, organizer, eventId, {
        applicationSource: "peatix",
        referral: "sns",
      });
      await manualCheckIn(app, organizer, eventId, { applicationSource: "peatix" });
      const response = await call(app, organizer, `${base}/breakdown`);
      expect(response.status).toBe(200);
      expect((await response.json()) as CheckinBreakdown).toEqual({
        applicationSource: [
          { value: "connpass", count: 1 },
          { value: "peatix", count: 2 },
          { value: "direct", count: 0 },
          { value: "other", count: 0 },
        ],
        referral: [
          { value: "friend", count: 2 },
          { value: "sns", count: 1 },
          { value: "announcement", count: 0 },
          { value: "other", count: 0 },
        ],
        total: 3,
        discounts: [{ discountId: null, name: null, active: true, count: 3, discountTotal: 0 }],
        referrers: [],
      });
    });

    it("CSV は BOM つきの text/csv で、チェックインの古い順・入れ方と入れた人つき", async () => {
      const staff = await makeStaff(app, organizer, eventId, { displayName: "受付係" });
      const participant = await loginAs(app);
      await checkIn(app, participant.cookie, eventId, { name: "LINE の人" });
      await manualCheckIn(app, staff.cookie, eventId, { name: "=手の人", paymentMethod: "free" });
      const response = await call(app, organizer, `${base}/export`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("content-disposition")).toMatch(
        /^attachment; filename="participants-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder().decode(bytes.slice(3)).split("\r\n");
      expect(lines[0]).toBe(
        "名前,チェックインの時刻,申し込みの媒体,知ったきっかけ,支払い方法,金額,割引,割引の額,紹介者,入れ方,入れた人",
      );
      expect(lines[1]).toMatch(
        /^LINE の人,\d{4}-\d{2}-\d{2} \d{2}:\d{2},connpass,知人の紹介,PayPay,1000,,,,LINE,$/,
      );
      expect(lines[2]).toMatch(/^'=手の人,.+,無料（招待など）,0,,,,手,受付係$/);
    });

    it("受付係は内訳と CSV を読めない（403）", async () => {
      const staff = await makeStaff(app, organizer, eventId);
      expect((await call(app, staff.cookie, `${base}/breakdown`)).status).toBe(403);
      expect((await call(app, staff.cookie, `${base}/export`)).status).toBe(403);
    });
  });

  describe("アカウントを消したとき（AD-7）", () => {
    it("本人のアカウントを消すとチェックインも消え、受付係を消すと手のチェックインは残って入れた人が空になる", async () => {
      const staff = await makeStaff(app, organizer, eventId, { displayName: "受付係" });
      const participant = await loginAs(app);
      await checkIn(app, participant.cookie, eventId, { name: "消える人" });
      const manual = await manualCheckIn(app, staff.cookie, eventId, { name: "手の人" });

      const deleted = await call(
        app,
        organizer,
        `/api/v1/accounts/${participant.account.id}`,
        "DELETE",
      );
      expect(deleted.status).toBe(204);
      expect((await listOf(organizer)).map((row) => row.name)).toEqual(["手の人"]);

      const removedStaff = await call(
        app,
        organizer,
        `/api/v1/accounts/${staff.account.id}`,
        "DELETE",
      );
      expect(removedStaff.status).toBe(204);
      expect(await listOf(organizer)).toEqual([{ ...manual, enteredByName: null }]);
      const row = await database.pool.query<{ entered_by: string | null }>(
        "SELECT entered_by FROM checkin",
      );
      expect(row.rows).toEqual([{ entered_by: null }]);
    });

    it("チェックインのある交流会は消せない（RESTRICT）", async () => {
      await manualCheckIn(app, organizer, eventId);
      await expect(
        database.pool.query("DELETE FROM event WHERE id = $1", [eventId]),
      ).rejects.toThrow(/foreign key/);
    });
  });
});
