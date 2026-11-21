// キャンセル待ち・期限つきの繰り上げ・当日の空きの結合のテスト（booking-004 US2〜US4・research R4〜R9・S2〜S7・S13）。
// 偽の送り手のメールから札を読む。時刻は交流会の始まりと打診の期限を DB で動かして作る。名前・アドレスはどれも架空のもの。
import "@hono/zod-openapi";
import type {
  ApplyPage,
  ApplyResult,
  EntryTokenView,
  MyEntryList,
} from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase } from "../../../test/helpers/booking.ts";
import {
  anonymous,
  apply,
  entryTokenOf,
  openSelfPage,
} from "../../../test/helpers/booking-apply.ts";
import { notifyConfig, readOutbox } from "../../../test/helpers/booking-notify.ts";
import {
  TEST_JOB_SECRET,
  expireOffer,
  noticeKinds,
  pendingOffers,
  setCapacity,
  statusOf,
  tick,
} from "../../../test/helpers/booking-waitlist.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN } from "../../../test/helpers/reception.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** 1時間（ミリ秒）。 */
const HOUR_MS = 60 * 60 * 1000;

/** 見本のアドレス（架空）。 */
const GUEST = "waitlist-guest@example.com";

describe("キャンセル待ちと繰り上げ", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig({}, { jobTriggerSecret: TEST_JOB_SECRET }));
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    base = bookingBase(eventId);
    await openSelfPage(app, owner.cookie, eventId);
  });

  /**
   * 参加者として申し込む。
   * @param displayName 表示名
   * @returns クッキーと申込み
   */
  async function join(displayName: string) {
    const person = await loginAs(app, { displayName });
    const response = await apply(app, person.cookie, eventId, { name: displayName });
    expect([200, 201]).toContain(response.status);
    const result = (await response.json()) as ApplyResult;
    return { cookie: person.cookie, entry: result.entry, page: result.page };
  }

  /**
   * 自分の申込みの一覧の最初の行。
   * @param cookie クッキー
   * @returns 1行
   */
  async function myFirst(cookie: string) {
    const list = (await (
      await call(app, cookie, "/api/v1/booking/me/entries")
    ).json()) as MyEntryList;
    const [first] = list.entries;
    if (!first) throw new Error("自分の申込みがありません。");
    return first;
  }

  /**
   * 打診に答える（LINE の人）。
   * @param cookie クッキー
   * @param entryId 申込みの ID
   * @param answer 参加する・辞退する
   * @returns 応答
   */
  function respond(cookie: string, entryId: string, answer: "accept" | "decline") {
    return call(app, cookie, `/api/v1/booking/me/entries/${entryId}/respond`, "POST", { answer });
  }

  /**
   * 交流会の始まりを動かす。
   * @param ms 今からのミリ秒
   */
  async function startIn(ms: number): Promise<void> {
    await database.pool.query("UPDATE event SET starts_at = $1 WHERE id = $2", [
      new Date(Date.now() + ms),
      eventId,
    ]);
  }

  it("残りが0なら、申し込んだ人はキャンセル待ちに入り、何番目かと人数が出る", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const page = (await (await anonymous(app, `${base}/page`)).json()) as ApplyPage;
    expect(page.seats).toEqual({ capacity: 1, remaining: 1, waitlist: 0, sameDay: false });
    await join("中村 さき");
    const second = await join("森 はるか");
    expect(second.entry).toMatchObject({
      status: "waitlisted",
      waitlistPosition: 1,
      canAccept: false,
    });
    expect(second.page.seats).toEqual({ capacity: 1, remaining: 0, waitlist: 1, sameDay: false });
    expect(await noticeKinds(database, second.entry.id)).toEqual(["waitlisted"]);
    const third = await join("林 たろう");
    expect(third.entry.waitlistPosition).toBe(2);
    // 参加者の答えにほかの人の名前を出さない（S13）
    const anon = JSON.stringify(await (await anonymous(app, `${base}/page`)).json());
    expect(anon).not.toContain("中村");
    expect(anon).not.toContain("森");
    expect(JSON.stringify(third.page)).not.toContain("森");
    // キャンセル待ちの人の取り消しで、後ろが繰り上がる
    expect(
      (
        await call(
          app,
          second.cookie,
          `/api/v1/booking/me/entries/${second.entry.id}/cancel`,
          "POST",
        )
      ).status,
    ).toBe(200);
    expect((await myFirst(third.cookie)).waitlistPosition).toBe(1);
  });

  it("確定の人が取り消すと先頭に打診し、参加で確定、辞退で次の人へ回す", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    const offered = await myFirst(second.cookie);
    expect(offered).toMatchObject({ status: "offered", canAccept: true, offerExpired: false });
    const deadline = new Date(offered.offerDeadline ?? "");
    expect(deadline.getTime()).toBeGreaterThan(Date.now() + 9 * HOUR_MS);
    // 24時間（夜に切れるなら朝の9時まで延びるので、長くて33時間）
    expect(deadline.getTime()).toBeLessThanOrEqual(Date.now() + 33 * HOUR_MS);
    expect(await noticeKinds(database, second.entry.id)).toEqual(["waitlisted", "offered"]);

    const declined = await respond(second.cookie, second.entry.id, "decline");
    expect(declined.status).toBe(200);
    expect(await statusOf(database, second.entry.id)).toBe("cancelled");
    expect(await statusOf(database, third.entry.id)).toBe("offered");

    const accepted = await respond(third.cookie, third.entry.id, "accept");
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ status: "confirmed", canAccept: false });
    expect(await noticeKinds(database, third.entry.id)).toEqual([
      "waitlisted",
      "offered",
      "confirmed",
    ]);
    // もう打診中ではない
    expect((await respond(third.cookie, third.entry.id, "accept")).status).toBe(409);
  });

  it("期限を過ぎた返事は 410。読む窓口は書かずに期限切れと見せ、書く窓口と定期の仕事が片付けて次へ回す", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    await expireOffer(database, second.entry.id);

    // GET は書かない（S6）
    expect(await myFirst(second.cookie)).toMatchObject({
      status: "offered",
      offerExpired: true,
      canAccept: false,
    });
    expect(await statusOf(database, second.entry.id)).toBe("offered");
    const page = (await (await anonymous(app, `${base}/page`)).json()) as ApplyPage;
    expect(page.seats).toMatchObject({ remaining: 0, waitlist: 1 });

    const late = await respond(second.cookie, second.entry.id, "accept");
    expect(late.status).toBe(410);
    expect(((await late.json()) as ErrorBody).error.code).toBe("BOOKING_OFFER_EXPIRED");
    expect(await statusOf(database, second.entry.id)).toBe("cancelled");
    expect(await noticeKinds(database, second.entry.id)).toEqual([
      "waitlisted",
      "offered",
      "offer_expired",
    ]);
    expect(await statusOf(database, third.entry.id)).toBe("offered");

    // 定期の仕事でも同じに片付く
    await expireOffer(database, third.entry.id);
    const response = await tick(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expired: 1 });
    expect(await statusOf(database, third.entry.id)).toBe("cancelled");
  });

  it("席が空いてもキャンセル待ちがいれば、新しい人は待ちを飛びこさない", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    // 片付けを通さずに席を空ける（期限切れの直後のような形）
    await database.pool.query("UPDATE booking_entry SET status = 'cancelled' WHERE id = $1", [
      first.entry.id,
    ]);
    const page = (await (await anonymous(app, `${base}/page`)).json()) as ApplyPage;
    expect(page.seats).toMatchObject({ remaining: 0, waitlist: 1 });
    const newcomer = await join("林 たろう");
    expect(newcomer.entry.status).toBe("waitlisted");
    expect(await statusOf(database, second.entry.id)).toBe("offered");
  });

  it("最後の1席に同時に2人が申し込んでも、定員を超えない（S2）", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const a = await loginAs(app, { displayName: "中村 さき" });
    const b = await loginAs(app, { displayName: "森 はるか" });
    const results = await Promise.all([
      apply(app, a.cookie, eventId, { name: "中村 さき" }),
      apply(app, b.cookie, eventId, { name: "森 はるか" }),
    ]);
    const statuses = await Promise.all(
      results.map(async (response) => ((await response.json()) as ApplyResult).entry.status),
    );
    expect(statuses.sort()).toEqual(["confirmed", "waitlisted"]);
  });

  it("定期の仕事が同時に2つ動いても、打診は1つ・知らせは1回（S2・S11）", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    await database.pool.query("UPDATE booking_entry SET status = 'cancelled' WHERE id = $1", [
      first.entry.id,
    ]);
    const [x, y] = await Promise.all([tick(app), tick(app)]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    expect(await pendingOffers(database)).toBe(1);
    expect(
      (await noticeKinds(database, second.entry.id)).filter((kind) => kind === "offered"),
    ).toHaveLength(1);
  });

  it("定員を増やすと、増えた席の分だけ打診する。定員を空にすると全員に打診する", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    const fourth = await join("石井 じろう");
    await setCapacity(app, owner.cookie, eventId, 2);
    expect(await statusOf(database, second.entry.id)).toBe("offered");
    expect(await statusOf(database, third.entry.id)).toBe("waitlisted");
    await setCapacity(app, owner.cookie, eventId, null);
    expect(await statusOf(database, third.entry.id)).toBe("offered");
    expect(await statusOf(database, fourth.entry.id)).toBe("offered");
  });

  it("ほかの人の申込みには答えられない（404）。中止した会と知らない札は答えられない", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    expect((await respond(first.cookie, second.entry.id, "accept")).status).toBe(404);
    const unknown = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${"x".repeat(43)}/respond`,
      "POST",
      {
        answer: "accept",
      },
    );
    expect(unknown.status).toBe(404);
  });

  it("メールの人は満員ならキャンセル待ちに入り、打診の知らせの返事の札で参加できる。札は SHA-256 だけ", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    expect(
      (
        await anonymous(app, `${base}/email-requests`, "POST", {
          name: "小林 はると",
          email: GUEST,
        })
      ).status,
    ).toBe(202);
    const [confirmMail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const entryToken = entryTokenOf(confirmMail?.text ?? "");
    const confirmed = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${entryToken}/confirm`,
      "POST",
    );
    expect(await confirmed.json()).toMatchObject({
      entry: { status: "waitlisted", waitlistPosition: 1 },
    });

    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    const [offerMail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    expect(offerMail?.subject).toBe("【打診】土曜の練習");
    const offerToken = entryTokenOf(offerMail?.text ?? "");
    expect(offerToken).not.toBe(entryToken);
    const stored = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM booking_offer WHERE token_hash IS NOT NULL",
    );
    expect(stored.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.token_hash).not.toBe(offerToken);

    // GET では答えない（S6）
    const view = (await (
      await anonymous(app, `/api/v1/booking/entry-tokens/${offerToken}`)
    ).json()) as EntryTokenView;
    expect(view.entry).toMatchObject({ status: "offered", canAccept: true });
    const accepted = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${offerToken}/respond`,
      "POST",
      {
        answer: "accept",
      },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ entry: { status: "confirmed" } });
    // 申込みの札でも同じ申込みが見える
    const again = (await (
      await anonymous(app, `/api/v1/booking/entry-tokens/${entryToken}`)
    ).json()) as EntryTokenView;
    expect(again.entry?.status).toBe("confirmed");
  });

  it("返事の札は待っている打診にだけ効き、打診を閉じる・申込みの札を替えると使えない", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    /**
     * メールで申し込んで確定し、申込みの札を返す。
     * @returns 申込みの札
     */
    const emailApply = async (): Promise<string> => {
      await anonymous(app, `${base}/email-requests`, "POST", { name: "小林 はると", email: GUEST });
      const [mail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
      const token = entryTokenOf(mail?.text ?? "");
      await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
      return token;
    };
    const entryToken = await emailApply();
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    const [offerMail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const offerToken = entryTokenOf(offerMail?.text ?? "");
    const accepted = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${offerToken}/respond`,
      "POST",
      { answer: "accept" },
    );
    expect(accepted.status).toBe(200);
    // 答えには「このリンクは使い終わった」を入れ、取り消す入口を出させない
    expect(await accepted.json()).toMatchObject({
      linkSpent: true,
      entry: { status: "confirmed", cancellable: false },
    });
    // 打診を閉じたら、返事の札では見る・取り消す・返事ができない（申込みの札は使える）
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${offerToken}`)).status).toBe(404);
    expect(
      (await anonymous(app, `/api/v1/booking/entry-tokens/${offerToken}/cancel`, "POST")).status,
    ).toBe(404);
    const byEntryToken = await anonymous(app, `/api/v1/booking/entry-tokens/${entryToken}`);
    expect(byEntryToken.status).toBe(200);
    expect(await byEntryToken.json()).toMatchObject({
      linkSpent: false,
      entry: { cancellable: true },
    });
    const tokens = await database.pool.query(
      "SELECT 1 FROM booking_offer WHERE token_hash IS NOT NULL",
    );
    expect(tokens.rowCount).toBe(0);
    // 確定の知らせに、使えなくなった返事の札のリンクを入れない
    const [confirmedMail] = (await readOutbox(app, owner.cookie)).filter(
      (m) => m.method === "email",
    );
    expect(confirmedMail?.text).not.toContain(offerToken);
  });

  it("打診中にもう一度メールで申し込むと、前の返事の札は使えなくなる", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    await anonymous(app, `${base}/email-requests`, "POST", { name: "小林 はると", email: GUEST });
    const [mail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${entryTokenOf(mail?.text ?? "")}/confirm`,
      "POST",
    );
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    const [offerMail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const offerToken = entryTokenOf(offerMail?.text ?? "");
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    await anonymous(app, `${base}/email-requests`, "POST", { name: "小林 はると", email: GUEST });
    const [again] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const newToken = entryTokenOf(again?.text ?? "");
    await anonymous(app, `/api/v1/booking/entry-tokens/${newToken}/confirm`, "POST");
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${offerToken}`)).status).toBe(404);
    // 新しい申込みの札で打診に答えられる
    const accepted = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${newToken}/respond`,
      "POST",
      { answer: "accept" },
    );
    expect(accepted.status).toBe(200);
  });

  it("キャンセル待ちのメールの人が確定し直したときの片付けで打診したら、その知らせの返事の札は使える", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    await anonymous(app, `${base}/email-requests`, "POST", { name: "小林 はると", email: GUEST });
    const [mail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${entryTokenOf(mail?.text ?? "")}/confirm`,
      "POST",
    );
    // 1人目が取り消して2人目に打診し、その打診の期限が切れる
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    expect(await statusOf(database, second.entry.id)).toBe("offered");
    await expireOffer(database, second.entry.id);
    // メールの人が新しい確認の札で確定し直すと、片付けで2人目が取り消しになり、メールの人に打診する
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    await anonymous(app, `${base}/email-requests`, "POST", { name: "小林 はると", email: GUEST });
    const [again] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const newToken = entryTokenOf(again?.text ?? "");
    const reconfirmed = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${newToken}/confirm`,
      "POST",
    );
    expect(reconfirmed.status).toBe(200);
    expect(await statusOf(database, second.entry.id)).toBe("cancelled");
    const [offerMail] = (await readOutbox(app, owner.cookie)).filter((m) => m.method === "email");
    const offerToken = entryTokenOf(offerMail?.text ?? "");
    expect(offerToken).not.toBe(newToken);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${offerToken}`)).status).toBe(200);
    const accepted = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${offerToken}/respond`,
      "POST",
      { answer: "accept" },
    );
    expect(accepted.status).toBe(200);
  });

  it("期限の切れた打診中の人が申し込み直すと、片付けのあとに決める（打診中のまま返さない）", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    expect(await statusOf(database, second.entry.id)).toBe("offered");
    await expireOffer(database, second.entry.id);
    const again = await apply(app, second.cookie, eventId, { name: "森 はるか" });
    expect(again.status).toBe(201);
    expect(((await again.json()) as ApplyResult).entry.status).toBe("confirmed");
    expect(await noticeKinds(database, second.entry.id)).toContain("offer_expired");
  });

  it("連絡先のないキャンセル待ち（手で足した人）には自動で打診せず、次の人に回す。名簿に連絡先がないことが出る", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const manual = await call(app, owner.cookie, `${base}/entries`, "POST", {
      name: "電話の 山田",
      applicationSource: "other",
      waitlist: true,
    });
    const manualId = ((await manual.json()) as { id: string }).id;
    const second = await join("森 はるか");
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    expect(await statusOf(database, manualId)).toBe("waitlisted");
    expect(await statusOf(database, second.entry.id)).toBe("offered");
    const roster = (await (await call(app, owner.cookie, `${base}/entries`)).json()) as {
      entries: { id: string; hasContact: boolean }[];
    };
    expect(roster.entries.find((entry) => entry.id === manualId)?.hasContact).toBe(false);
    expect(roster.entries.find((entry) => entry.id === second.entry.id)?.hasContact).toBe(true);
    // 主催者の手の打診はできる
    const offered = await call(app, owner.cookie, `${base}/entries/${manualId}/offer`, "POST");
    expect(offered.status).toBe(200);
  });

  it("定員を保存すると枠を押さえるのをやめる印を消し、飛び入りで満員になると付け直す", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    await join("中村 さき");
    const released = async () =>
      (
        await database.pool.query<{ at: Date | null }>(
          "SELECT quota_released_at AS at FROM booking_setting WHERE event_id = $1",
          [eventId],
        )
      ).rows[0]?.at ?? null;
    expect(await released()).not.toBeNull();
    await setCapacity(app, owner.cookie, eventId, 2);
    expect(await released()).toBeNull();
    const walkIn = await call(app, owner.cookie, `${base}/walk-ins`, "POST", SAMPLE_CHECKIN);
    expect(walkIn.status).toBe(201);
    expect(await released()).not.toBeNull();
  });

  it("始まりが近いと打診せず当日の空きにし、キャンセル待ちに1回だけ知らせ、先着で確定する", async () => {
    await setCapacity(app, owner.cookie, eventId, 1);
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    await startIn(2.5 * HOUR_MS);
    await call(app, first.cookie, `/api/v1/booking/me/entries/${first.entry.id}/cancel`, "POST");
    expect(await pendingOffers(database)).toBe(0);
    expect(await noticeKinds(database, second.entry.id)).toEqual(["waitlisted", "same_day"]);
    expect(await noticeKinds(database, third.entry.id)).toEqual(["waitlisted", "same_day"]);
    const page = (await (await anonymous(app, `${base}/page`)).json()) as ApplyPage;
    expect(page.seats).toEqual({ capacity: 1, remaining: 1, waitlist: 2, sameDay: true });
    expect(await myFirst(third.cookie)).toMatchObject({ status: "waitlisted", canAccept: true });

    expect((await respond(third.cookie, third.entry.id, "accept")).status).toBe(200);
    expect(await statusOf(database, third.entry.id)).toBe("confirmed");
    const late = await respond(second.cookie, second.entry.id, "accept");
    expect(late.status).toBe(409);
    expect(((await late.json()) as ErrorBody).error.code).toBe("BOOKING_NO_SEAT");

    // もう1席空いても、当日の空きの知らせは2回目を送らない
    await call(app, third.cookie, `/api/v1/booking/me/entries/${third.entry.id}/cancel`, "POST");
    expect(
      (await noticeKinds(database, second.entry.id)).filter((kind) => kind === "same_day"),
    ).toHaveLength(1);
    // 新しい人は先着で確定する
    const newcomer = await join("石井 じろう");
    expect(newcomer.entry.status).toBe("confirmed");
  });
});
