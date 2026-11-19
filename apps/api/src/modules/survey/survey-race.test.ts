// アンケートの回答を書く窓口で、チェックインを読んでから書くまでの間にチェックインが取り消されたとき（結合のテスト。本物の PostgreSQL）。
// reception の findCheckin・getCheckin を包み、読んだ直後にそのチェックインを消して、間に取り消された形を作る。
// 外部キーの違反（23503）を 500 にせず、参加者は 403 SURVEY_NOT_CHECKED_IN、主催者は 404 CHECKIN_NOT_FOUND にする。
import "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";
import { SAMPLE_ANSWER, setSurveyOpen } from "../../../test/helpers/survey.ts";
import type * as reception from "../reception/index.ts";
import { upsertAnswer } from "./repository.ts";

/** チェックインを読んだ直後に動かす処理（テストごとに決める）。 */
const hooks = vi.hoisted(() => ({
  afterLookup: null as null | ((checkinId: string) => Promise<void>),
}));

vi.mock("../reception/index.ts", async (importOriginal) => {
  const original = await importOriginal<typeof reception>();
  return {
    ...original,
    findCheckin: async (...args: Parameters<typeof original.findCheckin>) => {
      const checkin = await original.findCheckin(...args);
      if (checkin && hooks.afterLookup) await hooks.afterLookup(checkin.id);
      return checkin;
    },
    getCheckin: async (...args: Parameters<typeof original.getCheckin>) => {
      const checkin = await original.getCheckin(...args);
      if (checkin && hooks.afterLookup) await hooks.afterLookup(checkin.id);
      return checkin;
    },
  };
});

const database = useTestDatabase();

/** ないチェックインの ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 回答の表の行の数を数える。
 * @returns 行の数
 */
async function countAnswers(): Promise<number> {
  const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM survey_answer");
  return Number(result.rows[0]?.count);
}

describe("読んでから書くまでの間にチェックインが取り消されたとき", () => {
  let app: TestApp;
  let organizer: string;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    hooks.afterLookup = null;
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    organizer = (
      await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST, displayName: "主催者" })
    ).cookie;
    eventId = (await createEvent(app, organizer)).id;
    base = `/api/v1/events/${eventId}/survey-answers`;
  });

  /** 読んだ直後に、そのチェックインを消すようにする（ほかの端末で取り消された形）。 */
  function deleteRightAfterLookup(): void {
    hooks.afterLookup = async (checkinId) => {
      await database.pool.query("DELETE FROM checkin WHERE id = $1", [checkinId]);
    };
  }

  it("参加者の送信は 500 にせず 403 SURVEY_NOT_CHECKED_IN で、回答は残らない", async () => {
    await setSurveyOpen(app, organizer, eventId, true);
    const participant = await loginAs(app, { displayName: "佐藤 太郎" });
    await checkIn(app, participant.cookie, eventId, { name: "佐藤 太郎" });
    deleteRightAfterLookup();
    const response = await call(app, participant.cookie, `${base}/me`, "PUT", SAMPLE_ANSWER);
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.code).toBe("SURVEY_NOT_CHECKED_IN");
    expect(await countAnswers()).toBe(0);
  });

  it("主催者の代わりの入力は 500 にせず 404 CHECKIN_NOT_FOUND で、回答は残らない", async () => {
    const row = await manualCheckIn(app, organizer, eventId);
    deleteRightAfterLookup();
    const response = await call(app, organizer, `${base}/checkins/${row.id}`, "PUT", SAMPLE_ANSWER);
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe("CHECKIN_NOT_FOUND");
    expect(await countAnswers()).toBe(0);
  });

  it("書く処理は、ないチェックインへの外部キーの違反を null にする", async () => {
    const values = {
      concern: null,
      monthlyPrice: null,
      tester: null,
      jobRole: null,
      jobType: null,
    };
    expect(await upsertAnswer(database.db, MISSING_ID, values)).toBeNull();
  });
});
