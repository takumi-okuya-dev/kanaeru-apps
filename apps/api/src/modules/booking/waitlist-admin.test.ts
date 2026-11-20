// 主催者のキャンセル待ちの手の操作と送った知らせ・定期の窓口の認証の結合のテスト（booking-004 US5・research R9・R13・R14・
// S1・S9・S10・S14）。名前・アドレスはどれも架空のもの。
import { Writable } from "node:stream";
import "@hono/zod-openapi";
import type { NoticeLog, Roster, RosterEntry } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, readRoster } from "../../../test/helpers/booking.ts";
import { apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { notifyConfig } from "../../../test/helpers/booking-notify.ts";
import {
  TEST_JOB_SECRET,
  expireOffer,
  noticeKinds,
  setCapacity,
  statusOf,
  tick,
} from "../../../test/helpers/booking-waitlist.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createLogger } from "../../kernel/logger.ts";

const database = useTestDatabase();

/** 1時間（ミリ秒）。 */
const HOUR_MS = 60 * 60 * 1000;

/**
 * ログを文字にためる道具を作る。
 * @returns ログの道具と、たまった文字を返す関数
 */
function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return {
    logger: createLogger({ level: "debug", pretty: false }, stream),
    text: () => chunks.join(""),
  };
}

describe("主催者のキャンセル待ちの操作", () => {
  let app: TestApp;
  let log: ReturnType<typeof captureLogger>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    log = captureLogger();
    app = buildApp(database, notifyConfig({}, { jobTriggerSecret: TEST_JOB_SECRET }), {
      logger: log.logger,
    });
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    base = bookingBase(eventId);
    await openSelfPage(app, owner.cookie, eventId);
    await setCapacity(app, owner.cookie, eventId, 1);
  });

  /**
   * 参加者として申し込み、申込みの ID を返す。
   * @param displayName 表示名
   * @returns 申込みの ID
   */
  async function join(displayName: string): Promise<string> {
    const person = await loginAs(app, { displayName });
    const response = await apply(app, person.cookie, eventId, { name: displayName });
    return ((await response.json()) as { entry: { id: string } }).entry.id;
  }

  /**
   * 名簿の行を引く。
   * @param roster 名簿
   * @param id 行の ID
   * @returns 行
   */
  function rowOf(roster: Roster, id: string): RosterEntry {
    const row = roster.entries.find((entry) => entry.id === id);
    if (!row) throw new Error("行がありません。");
    return row;
  }

  it("名簿にキャンセル待ちの何番目か・打診の期限・人数が出る", async () => {
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    let roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.counts).toMatchObject({ confirmed: 1, waitlisted: 2, offered: 0, cancelled: 0 });
    expect(rowOf(roster, second)).toMatchObject({
      status: "waitlisted",
      waitlistPosition: 1,
      offer: null,
    });
    expect(rowOf(roster, third).waitlistPosition).toBe(2);
    await call(app, owner.cookie, `${base}/entries/${first}/status`, "PUT", {
      status: "cancelled",
    });
    roster = await readRoster(app, owner.cookie, eventId);
    expect(rowOf(roster, second)).toMatchObject({
      status: "offered",
      waitlistPosition: null,
      offer: { expired: false, manual: false },
    });
    expect(rowOf(roster, third).waitlistPosition).toBe(1);
    await expireOffer(database, second);
    expect(rowOf(await readRoster(app, owner.cookie, eventId), second).offer?.expired).toBe(true);
  });

  it("手で打診する：席がなくても押さえる。キャンセル待ちでなければ・期限が取れなければ 409", async () => {
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const offered = await call(app, owner.cookie, `${base}/entries/${second}/offer`, "POST");
    expect(offered.status).toBe(200);
    expect(await offered.json()).toMatchObject({ status: "offered", offer: { manual: true } });
    expect(await noticeKinds(database, second)).toEqual(["waitlisted", "offered"]);
    const notWaiting = await call(app, owner.cookie, `${base}/entries/${first}/offer`, "POST");
    expect(notWaiting.status).toBe(409);
    expect(((await notWaiting.json()) as ErrorBody).error.code).toBe(
      "BOOKING_ENTRY_NOT_WAITLISTED",
    );
    const third = await join("林 たろう");
    await database.pool.query("UPDATE event SET starts_at = $1 WHERE id = $2", [
      new Date(Date.now() + 2 * HOUR_MS),
      eventId,
    ]);
    const short = await call(app, owner.cookie, `${base}/entries/${third}/offer`, "POST");
    expect(short.status).toBe(409);
    expect(((await short.json()) as ErrorBody).error.code).toBe("BOOKING_OFFER_WINDOW_SHORT");
  });

  it("確定にすると確定の知らせ（打診は取り下げ）。取り消すと次の人へ回し、知らせは送らない", async () => {
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    const third = await join("林 たろう");
    const confirmed = await call(app, owner.cookie, `${base}/entries/${second}/status`, "PUT", {
      status: "confirmed",
    });
    expect(confirmed.status).toBe(200);
    expect(await noticeKinds(database, second)).toEqual(["waitlisted", "confirmed"]);
    expect(await statusOf(database, third)).toBe("waitlisted");
    await call(app, owner.cookie, `${base}/entries/${first}/status`, "PUT", {
      status: "cancelled",
    });
    await call(app, owner.cookie, `${base}/entries/${second}/status`, "PUT", {
      status: "cancelled",
    });
    expect(await noticeKinds(database, first)).toEqual(["confirmed"]);
    expect(await statusOf(database, third)).toBe("offered");
    // 状態の入力にキャンセル待ち・打診中は選べない
    const bad = await call(app, owner.cookie, `${base}/entries/${third}/status`, "PUT", {
      status: "waitlisted",
    });
    expect(bad.status).toBe(400);
  });

  it("満員のとき、手で足す人をキャンセル待ちに入れられる。定員がなければ 409", async () => {
    await join("中村 さき");
    const added = await call(app, owner.cookie, `${base}/entries`, "POST", {
      name: "電話の 山田",
      applicationSource: "other",
      waitlist: true,
    });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ status: "waitlisted", waitlistPosition: 1 });
    const over = await call(app, owner.cookie, `${base}/entries`, "POST", {
      name: "電話の 佐藤",
      applicationSource: "other",
    });
    expect(await over.json()).toMatchObject({ status: "confirmed" });
    await setCapacity(app, owner.cookie, eventId, null);
    const off = await call(app, owner.cookie, `${base}/entries`, "POST", {
      name: "電話の 鈴木",
      applicationSource: "other",
      waitlist: true,
    });
    expect(off.status).toBe(409);
    expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_WAITLIST_OFF");
  });

  it("送った知らせの一覧は種類・手段・結果・時刻だけ（新しい順）。受付係は使えない", async () => {
    await join("中村 さき");
    const second = await join("森 はるか");
    await call(app, owner.cookie, `${base}/entries/${second}/offer`, "POST");
    const response = await call(app, owner.cookie, `${base}/entries/${second}/notices`);
    expect(response.status).toBe(200);
    const log = (await response.json()) as NoticeLog;
    expect(log.notices.map((notice) => notice.kind)).toEqual(["offered", "waitlisted"]);
    for (const notice of log.notices) {
      expect(Object.keys(notice).sort()).toEqual(["createdAt", "kind", "method", "result"]);
    }
    const staff = await makeStaff(app, owner.cookie, eventId);
    expect((await call(app, staff.cookie, `${base}/entries/${second}/notices`)).status).toBe(403);
    expect((await call(app, staff.cookie, `${base}/entries/${second}/offer`, "POST")).status).toBe(
      403,
    );
    const missing = await call(
      app,
      owner.cookie,
      `${base}/entries/00000000-0000-7000-8000-000000000000/notices`,
    );
    expect(missing.status).toBe(404);
  });

  it("定期の窓口は合言葉がない・違うと 404 で何も変えず、合えば数だけを返す。ログに名前を出さない（S1・S14）", async () => {
    const first = await join("中村 さき");
    const second = await join("森 はるか");
    await database.pool.query("UPDATE booking_entry SET status = 'cancelled' WHERE id = $1", [
      first,
    ]);
    expect((await tick(app, null)).status).toBe(404);
    expect((await tick(app, "wrong-secret")).status).toBe(404);
    expect(await statusOf(database, second)).toBe("waitlisted");
    const ok = await tick(app);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ events: 1, expired: 0, offered: 1, sameDay: 0, changed: 0 });
    expect(await statusOf(database, second)).toBe("offered");
    expect(log.text()).not.toContain("森");
    expect(log.text()).not.toContain(TEST_JOB_SECRET);
  });

  it("合言葉の設定がなければ、定期の窓口はいつも 404", async () => {
    const plain = buildApp(database, notifyConfig());
    expect((await tick(plain)).status).toBe(404);
  });
});
