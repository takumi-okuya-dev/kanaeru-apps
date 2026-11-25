// 名簿に当てる窓口の結合のテスト（本物の PostgreSQL）：LINE のチェックインが候補に出る・当てると来た・ちがう人・同じアカウントは自動・
// 名簿から選ぶ・飛び入りにする・名簿から選んで手でチェックイン・飛び入りの手でのチェックイン・当てを外す・二重の当て・
// ほかの交流会のチェックイン・チェックインの取り消しで外れる・日が終わると来なかった。名前はどれも架空のもの。
import "@hono/zod-openapi";
import type { MatchBoard } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, readRoster, useRoster } from "../../../test/helpers/booking.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN, checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

describe("名簿に当てる窓口", () => {
  let app: TestApp;
  let owner: { cookie: string; account: { id: string } };
  let staff: { cookie: string; account: { id: string } };
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "持ち主" });
    eventId = (await createEvent(app, owner.cookie)).id;
    base = bookingBase(eventId);
    await useRoster(app, owner.cookie, eventId);
    staff = await makeStaff(app, owner.cookie, eventId, { displayName: "受付係" });
  });

  /**
   * 受付係の画面を読む。
   * @returns 受付係の画面
   */
  async function board(): Promise<MatchBoard> {
    const response = await call(app, staff.cookie, `${base}/matches`);
    expect(response.status).toBe(200);
    return (await response.json()) as MatchBoard;
  }

  /**
   * 名簿の行の ID を名前で引く。
   * @param name 名前
   * @returns 行の ID
   */
  async function entryIdOf(name: string): Promise<string> {
    const roster = await readRoster(app, owner.cookie, eventId);
    const entry = roster.entries.find((item) => item.name === name);
    if (!entry) throw new Error("行がありません。");
    return entry.id;
  }

  it("LINE のチェックインの名前がそろう行が1つなら候補で、受付係が当てると来たになる", async () => {
    await importNames(app, owner.cookie, eventId, ["山田 花子", "鈴木 一郎"]);
    const participant = await loginAs(app);
    const checkin = await checkIn(app, participant.cookie, eventId, { name: "山田花子" });
    const before = await board();
    expect(before.checkins[0]).toMatchObject({
      checkinId: checkin.checkin.id,
      name: "山田花子",
      method: "line",
      state: "candidate",
      entry: { name: "山田 花子" },
    });
    expect(before.counts).toEqual({ came: 0, confirmed: 2, walkIn: 0, pending: 1 });

    const entryId = await entryIdOf("山田 花子");
    const matched = await call(
      app,
      staff.cookie,
      `${base}/checkins/${checkin.checkin.id}/match`,
      "POST",
      {
        entryId,
      },
    );
    expect(matched.status).toBe(200);
    const after = (await matched.json()) as MatchBoard;
    expect(after.checkins[0]?.state).toBe("matched_manual");
    expect(after.counts).toMatchObject({ came: 1, pending: 0 });
    expect(after.choices.map((choice) => choice.name)).toEqual(["鈴木 一郎"]);
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries.find((entry) => entry.id === entryId)).toMatchObject({
      attendance: "came",
      match: "manual",
    });
    expect(roster.counts.came).toBe(1);
  });

  it("ちがう人にすると、その組は候補に出なくなる", async () => {
    await importNames(app, owner.cookie, eventId, ["佐藤 けん"]);
    const participant = await loginAs(app);
    const checkin = await checkIn(app, participant.cookie, eventId, { name: "佐藤けん" });
    const response = await call(
      app,
      staff.cookie,
      `${base}/checkins/${checkin.checkin.id}/dismiss`,
      "POST",
      {
        entryId: await entryIdOf("佐藤 けん"),
      },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as MatchBoard).checkins[0]).toMatchObject({
      state: "unmatched",
      entry: null,
    });
  });

  it("名前がそろう行が2つあれば候補を出さず、名簿から選んで当てられる", async () => {
    await importNames(app, owner.cookie, eventId, ["佐藤 けん", "佐藤 けん"]);
    const checkin = await manualCheckIn(app, staff.cookie, eventId, { name: "佐藤 けん" });
    expect((await board()).checkins[0]?.state).toBe("unmatched");
    const [first] = (await readRoster(app, owner.cookie, eventId)).entries;
    const response = await call(app, staff.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
      entryId: first?.id,
    });
    expect(((await response.json()) as MatchBoard).checkins[0]?.state).toBe("matched_manual");
  });

  it("同じアカウントの行は、何もしなくても自動で当たり、外せない", async () => {
    const participant = await loginAs(app, { displayName: "中村 さき" });
    await importNames(app, owner.cookie, eventId, ["中村 さき"]);
    const entryId = await entryIdOf("中村 さき");
    // 自前のページの申込みは次の仕様。ここでは本人のアカウントを表に直に入れて、読むときの当てを確かめる
    await database.pool.query("UPDATE booking_entry SET account_id = $1 WHERE id = $2", [
      participant.account.id,
      entryId,
    ]);
    await checkIn(app, participant.cookie, eventId, { name: "さき" });
    expect((await board()).checkins[0]?.state).toBe("matched_auto");
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries[0]).toMatchObject({ attendance: "came", match: "auto" });
    const unmatch = await call(app, staff.cookie, `${base}/entries/${entryId}/match`, "DELETE");
    expect(unmatch.status).toBe(409);
    expect(((await unmatch.json()) as ErrorBody).error.code).toBe("BOOKING_MATCH_NOT_MANUAL");
  });

  it("当たらないチェックインを飛び入りにすると、名前と媒体を写した行ができて当たる", async () => {
    const participant = await loginAs(app);
    const checkin = await checkIn(app, participant.cookie, eventId, {
      name: "井上 そら",
      applicationSource: "connpass",
    });
    const response = await call(
      app,
      staff.cookie,
      `${base}/checkins/${checkin.checkin.id}/walk-in`,
      "POST",
    );
    expect(response.status).toBe(201);
    const after = (await response.json()) as MatchBoard;
    expect(after.checkins[0]).toMatchObject({ state: "walk_in", entry: { name: "井上 そら" } });
    expect(after.counts.walkIn).toBe(1);
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries[0]).toMatchObject({
      entryKind: "walk_in",
      applicationSource: "connpass",
      enteredByName: "受付係",
      attendance: "came",
    });
    const again = await call(
      app,
      staff.cookie,
      `${base}/checkins/${checkin.checkin.id}/walk-in`,
      "POST",
    );
    expect(again.status).toBe(409);
  });

  it("名簿から選んで手でチェックインすると、その行に当たる。もう当たった行は 409", async () => {
    await importNames(app, owner.cookie, eventId, ["小林 はると"]);
    const entryId = await entryIdOf("小林 はると");
    const response = await call(app, staff.cookie, `${base}/entries/${entryId}/checkin`, "POST", {
      ...SAMPLE_CHECKIN,
      name: "小林 はると",
      applicationSource: "other",
      paymentMethod: "cash",
    });
    expect(response.status).toBe(201);
    const after = (await response.json()) as MatchBoard;
    expect(after.checkins[0]).toMatchObject({ method: "manual", state: "matched_manual" });
    const checkins = await call(app, staff.cookie, `/api/v1/events/${eventId}/checkins`);
    expect(((await checkins.json()) as { checkins: unknown[] }).checkins).toHaveLength(1);
    const twice = await call(
      app,
      staff.cookie,
      `${base}/entries/${entryId}/checkin`,
      "POST",
      SAMPLE_CHECKIN,
    );
    expect(twice.status).toBe(409);
    expect(((await twice.json()) as ErrorBody).error.code).toBe("BOOKING_ENTRY_NOT_MATCHABLE");
  });

  it("名簿にいない人を飛び入りで手でチェックインすると、チェックインと飛び入りの行が一緒にできる", async () => {
    const response = await call(app, staff.cookie, `${base}/walk-ins`, "POST", {
      ...SAMPLE_CHECKIN,
      name: "森 あおい",
    });
    expect(response.status).toBe(201);
    expect(((await response.json()) as MatchBoard).checkins[0]).toMatchObject({
      name: "森 あおい",
      state: "walk_in",
    });
    const invalid = await call(app, staff.cookie, `${base}/walk-ins`, "POST", { name: "" });
    expect(invalid.status).toBe(400);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
  });

  it("手で当てたものは外せる。1つのチェックインを2つの行に当てると 409", async () => {
    await importNames(app, owner.cookie, eventId, ["田中 りく", "田中 そう"]);
    const checkin = await manualCheckIn(app, staff.cookie, eventId, { name: "田中" });
    const first = await entryIdOf("田中 りく");
    const second = await entryIdOf("田中 そう");
    await call(app, staff.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
      entryId: first,
    });
    const twice = await call(app, staff.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
      entryId: second,
    });
    expect(twice.status).toBe(409);
    expect(((await twice.json()) as ErrorBody).error.code).toBe("BOOKING_CHECKIN_ALREADY_MATCHED");
    const unmatch = await call(app, staff.cookie, `${base}/entries/${first}/match`, "DELETE");
    expect(unmatch.status).toBe(200);
    expect(((await unmatch.json()) as MatchBoard).checkins[0]?.state).toBe("unmatched");
  });

  it("取り消しの行・ほかの交流会のチェックイン・ない行には当てられない", async () => {
    await importNames(app, owner.cookie, eventId, ["山田 花子"]);
    const entryId = await entryIdOf("山田 花子");
    await call(app, owner.cookie, `${base}/entries/${entryId}/status`, "PUT", {
      status: "cancelled",
    });
    const checkin = await manualCheckIn(app, staff.cookie, eventId, { name: "山田 花子" });
    expect((await board()).checkins[0]?.state).toBe("unmatched");
    const cancelled = await call(
      app,
      staff.cookie,
      `${base}/checkins/${checkin.id}/match`,
      "POST",
      {
        entryId,
      },
    );
    expect(cancelled.status).toBe(409);

    const otherEvent = (await createEvent(app, owner.cookie)).id;
    const foreign = await manualCheckIn(app, owner.cookie, otherEvent, { name: "山田 花子" });
    const wrongEvent = await call(
      app,
      staff.cookie,
      `${base}/checkins/${foreign.id}/match`,
      "POST",
      {
        entryId,
      },
    );
    expect(wrongEvent.status).toBe(404);
    expect(((await wrongEvent.json()) as ErrorBody).error.code).toBe("BOOKING_CHECKIN_NOT_FOUND");
    const missing = await call(app, staff.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
      entryId: "0193a1b2-0000-7000-8000-000000000000",
    });
    expect(missing.status).toBe(404);
  });

  it("受付でチェックインを取り消すと、当てが外れる", async () => {
    await importNames(app, owner.cookie, eventId, ["山田 花子"]);
    const checkin = await manualCheckIn(app, staff.cookie, eventId, { name: "山田 花子" });
    await call(app, staff.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
      entryId: await entryIdOf("山田 花子"),
    });
    await call(app, staff.cookie, `/api/v1/events/${eventId}/checkins/${checkin.id}`, "DELETE");
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries[0]?.attendance).toBe("pending");
  });

  it("交流会の日が終わると、当たらなかった確定の行が来なかったになる（取り消しは除く）", async () => {
    const past = (
      await createEvent(app, owner.cookie, {
        startsAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      })
    ).id;
    await useRoster(app, owner.cookie, past);
    await importNames(app, owner.cookie, past, ["来た人", "来なかった人", "取り消した人"]);
    const roster = await readRoster(app, owner.cookie, past);
    const [came, , cancelled] = roster.entries;
    const checkin = await manualCheckIn(app, owner.cookie, past, { name: "来た人" });
    await call(app, owner.cookie, `${bookingBase(past)}/checkins/${checkin.id}/match`, "POST", {
      entryId: came?.id,
    });
    await call(app, owner.cookie, `${bookingBase(past)}/entries/${cancelled?.id}/status`, "PUT", {
      status: "cancelled",
    });
    const after = await readRoster(app, owner.cookie, past);
    expect(after.eventEnded).toBe(true);
    expect(after.entries.map((entry) => [entry.name, entry.attendance])).toEqual([
      ["来た人", "came"],
      ["来なかった人", "no_show"],
      ["取り消した人", "pending"],
    ]);
    expect(after.counts).toMatchObject({ came: 1, noShow: 1, confirmed: 2, cancelled: 1 });
  });

  it("受付係の画面に出るのは、その交流会のチェックインだけ。使い方が受付だけなら 409", async () => {
    const otherEvent = (await createEvent(app, owner.cookie)).id;
    await manualCheckIn(app, owner.cookie, otherEvent, { name: "別の交流会の人" });
    expect((await board()).checkins).toEqual([]);
    await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "reception" });
    const off = await call(app, staff.cookie, `${base}/walk-ins`, "POST", SAMPLE_CHECKIN);
    expect(off.status).toBe(409);
  });
});
