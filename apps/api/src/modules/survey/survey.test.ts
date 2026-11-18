// アンケートの窓口の結合のテスト（本物の PostgreSQL）：自分の回答（チェックイン済みか・作る・直す・空で送る・開閉・同時に送る）・
// 主催者の代わりの入力（閉じていても受ける）・困りごとの一覧（名前はチェックインの名前・絞りこみ・並べ替え）・CSV・権限・
// チェックインの取り消しとアカウントの削除で回答が消えること（CASCADE）。
// 約束の zod の形は、@hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つ。
// このファイルは約束の値（選択肢の並び）を先に読むので、先に @hono/zod-openapi を読む（kernel/errors.ts と同じ）。
import "@hono/zod-openapi";
import type {
  MySurveyState,
  ProxySurveyState,
  SurveyAnswer,
  SurveyAnswerList,
} from "@workspace/contracts/survey";
import { JOB_ROLES, JOB_TYPES, MONTHLY_PRICES, TESTER_ANSWERS } from "@workspace/contracts/survey";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { SAMPLE_CHECKIN, checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";
import { SAMPLE_ANSWER, answerSurvey, setSurveyOpen } from "../../../test/helpers/survey.ts";

const database = useTestDatabase();

/** ない交流会・チェックインの ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 回答の表の行の数を数える。
 * @returns 行の数
 */
async function countAnswers(): Promise<number> {
  const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM survey_answer");
  return Number(result.rows[0]?.count);
}

describe("アンケートの窓口", () => {
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
    eventId = (await createEvent(app, organizer)).id;
    base = `/api/v1/events/${eventId}/survey-answers`;
  });

  /**
   * 困りごとの一覧を読む（主催者）。
   * @param query 問い合わせ（?tester=yes など）
   * @returns 一覧の行
   */
  async function listOf(query = ""): Promise<SurveyAnswerList["answers"]> {
    const response = await call(app, organizer, `${base}${query}`);
    expect(response.status).toBe(200);
    return ((await response.json()) as SurveyAnswerList).answers;
  }

  /**
   * チェックインした参加者を作る。
   * @param name チェックインの名前
   * @returns クッキーとアカウントとチェックインの ID
   */
  async function checkedInParticipant(name = "佐藤 太郎") {
    const participant = await loginAs(app, { displayName: name });
    const { checkin } = await checkIn(app, participant.cookie, eventId, { name });
    return { ...participant, checkinId: checkin.id };
  }

  describe("自分の回答", () => {
    it("チェックインの前は checkedIn: false で、開いていても送ると 403（先にチェックイン）", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await loginAs(app);
      const state = await call(app, participant.cookie, `${base}/me`);
      expect(state.status).toBe(200);
      expect((await state.json()) as MySurveyState).toEqual({ checkedIn: false, answer: null });

      const sent = await call(app, participant.cookie, `${base}/me`, "PUT", SAMPLE_ANSWER);
      expect(sent.status).toBe(403);
      expect(((await sent.json()) as ErrorBody).error.code).toBe("SURVEY_NOT_CHECKED_IN");
      expect(await countAnswers()).toBe(0);
    });

    it("閉じていれば、チェックイン済みでも、していなくても 409 で、記録は変わらない", async () => {
      const participant = await checkedInParticipant();
      const sent = await call(app, participant.cookie, `${base}/me`, "PUT", SAMPLE_ANSWER);
      expect(sent.status).toBe(409);
      const { error } = (await sent.json()) as ErrorBody;
      expect(error.code).toBe("SURVEY_CLOSED");
      expect(error.message).toContain("アンケートは閉じています");
      const stranger = await loginAs(app);
      expect((await call(app, stranger.cookie, `${base}/me`, "PUT", {})).status).toBe(409);
      expect(await countAnswers()).toBe(0);
    });

    it("開いている間は作って直せる（行は1つのまま・送らなかった欄は空になる）。閉じたあとも読める", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      const created = await answerSurvey(app, participant.cookie, eventId);
      expect(created).toMatchObject(SAMPLE_ANSWER);

      const edited = await call(app, participant.cookie, `${base}/me`, "PUT", {
        concern: "  会議の議事録が大変  ",
        monthlyPrice: "jpy500",
      });
      expect(edited.status).toBe(200);
      const answer = (await edited.json()) as SurveyAnswer;
      expect(answer).toMatchObject({
        concern: "会議の議事録が大変",
        monthlyPrice: "jpy500",
        tester: null,
        jobRole: null,
        jobType: null,
      });
      expect(Date.parse(answer.answeredAt)).toBeGreaterThanOrEqual(Date.parse(created.answeredAt));
      expect(await countAnswers()).toBe(1);

      await setSurveyOpen(app, organizer, eventId, false);
      const state = (await (
        await call(app, participant.cookie, `${base}/me`)
      ).json()) as MySurveyState;
      expect(state).toEqual({ checkedIn: true, answer });
    });

    it("何も入れずに送っても受け付け、空白だけの困りごとは空にする（必須にしない）", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      const response = await call(app, participant.cookie, `${base}/me`, "PUT", {
        concern: "   ",
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as SurveyAnswer).toMatchObject({
        concern: null,
        monthlyPrice: null,
        tester: null,
        jobRole: null,
        jobType: null,
      });
    });

    it("同時に何度送っても回答は1つ", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      const results = await Promise.all(
        ["jpy0", "jpy500", "jpy1000"].map((monthlyPrice) =>
          call(app, participant.cookie, `${base}/me`, "PUT", { monthlyPrice }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await countAnswers()).toBe(1);
    });

    it("入力の誤りは 400 と欄ごとの日本語の理由、ない交流会は 404、未ログインは 401", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      const invalid = await call(app, participant.cookie, `${base}/me`, "PUT", {
        monthlyPrice: "jpy100",
        concern: "あ".repeat(2001),
      });
      expect(invalid.status).toBe(400);
      expect(((await invalid.json()) as ErrorBody).error.fields).toEqual(
        expect.arrayContaining([
          {
            path: "monthlyPrice",
            message: "実現したら月いくらなら使うかは、選択肢から選んでください。",
          },
          { path: "concern", message: "困りごとは2,000文字までにしてください。" },
        ]),
      );
      const missing = `/api/v1/events/${MISSING_ID}/survey-answers/me`;
      expect((await call(app, participant.cookie, missing)).status).toBe(404);
      expect((await call(app, participant.cookie, missing, "PUT", {})).status).toBe(404);
      expect((await app.request(`${base}/me`)).status).toBe(401);
      expect(await countAnswers()).toBe(0);
    });

    it("選択肢の code はどれも DB に入る（CHECK と約束が食い違わない）", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      const longest = Math.max(
        MONTHLY_PRICES.length,
        TESTER_ANSWERS.length,
        JOB_ROLES.length,
        JOB_TYPES.length,
      );
      for (let index = 0; index < longest; index += 1) {
        const input = {
          monthlyPrice: MONTHLY_PRICES[index % MONTHLY_PRICES.length],
          tester: TESTER_ANSWERS[index % TESTER_ANSWERS.length],
          jobRole: JOB_ROLES[index % JOB_ROLES.length],
          jobType: JOB_TYPES[index % JOB_TYPES.length],
        };
        expect(await answerSurvey(app, participant.cookie, eventId, input)).toMatchObject(input);
      }
    });
  });

  describe("主催者の代わりの入力", () => {
    it("閉じていても、手でのチェックインの人の回答を入れて直せ、読める", async () => {
      const row = await manualCheckIn(app, organizer, eventId, { name: "手の人" });
      const path = `${base}/checkins/${row.id}`;
      const before = await call(app, organizer, path);
      expect(before.status).toBe(200);
      expect((await before.json()) as ProxySurveyState).toEqual({ answer: null });

      const saved = await call(app, organizer, path, "PUT", { ...SAMPLE_ANSWER, tester: "no" });
      expect(saved.status).toBe(200);
      const edited = await call(app, organizer, path, "PUT", { concern: "直した" });
      expect((await edited.json()) as SurveyAnswer).toMatchObject({
        concern: "直した",
        tester: null,
      });
      const after = (await (await call(app, organizer, path)).json()) as ProxySurveyState;
      expect(after.answer?.concern).toBe("直した");
      expect(await countAnswers()).toBe(1);
    });

    it("別の交流会・ないチェックインは 404、受付係とほかの人は 403", async () => {
      const other = await createEvent(app, organizer, { name: "別の交流会" });
      const otherRow = await manualCheckIn(app, organizer, other.id);
      expect(
        (await call(app, organizer, `${base}/checkins/${otherRow.id}`, "PUT", {})).status,
      ).toBe(404);
      expect((await call(app, organizer, `${base}/checkins/${MISSING_ID}`)).status).toBe(404);

      const row = await manualCheckIn(app, organizer, eventId);
      const staff = await makeStaff(app, organizer, eventId);
      const stranger = await loginAs(app);
      for (const cookie of [staff.cookie, stranger.cookie]) {
        expect((await call(app, cookie, `${base}/checkins/${row.id}`)).status).toBe(403);
        expect((await call(app, cookie, `${base}/checkins/${row.id}`, "PUT", {})).status).toBe(403);
      }
      expect(await countAnswers()).toBe(0);
    });
  });

  describe("困りごとの一覧", () => {
    it("名前はチェックインの名前で、回答の新しい順。チェックインの名前を直すと直した名前で出る", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const first = await checkedInParticipant("1人目");
      await answerSurvey(app, first.cookie, eventId, { concern: "1つ目" });
      const manual = await manualCheckIn(app, organizer, eventId, { name: "手の人" });
      await call(app, organizer, `${base}/checkins/${manual.id}`, "PUT", { concern: "2つ目" });

      const rows = await listOf();
      expect(rows.map((row) => [row.name, row.concern, row.method])).toEqual([
        ["手の人", "2つ目", "manual"],
        ["1人目", "1つ目", "line"],
      ]);
      expect(rows[1]).toMatchObject({
        checkinId: first.checkinId,
        ...SAMPLE_ANSWER,
        concern: "1つ目",
      });

      await call(app, organizer, `/api/v1/events/${eventId}/checkins/${manual.id}`, "PUT", {
        ...SAMPLE_CHECKIN,
        name: "手の人（直した）",
      });
      expect((await listOf()).map((row) => row.name)).toEqual(["手の人（直した）", "1人目"]);
    });

    it("テスターに「はい」だけに絞り、月いくらの高い順（分からない・答えていないは最後）に並べる", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const answers = [
        { name: "A", monthlyPrice: null, tester: "yes" },
        { name: "B", monthlyPrice: "jpy500", tester: "no" },
        { name: "C", monthlyPrice: "unknown", tester: "yes" },
        { name: "D", monthlyPrice: "jpy3000plus", tester: "yes" },
        { name: "E", monthlyPrice: "jpy1000", tester: null },
      ] as const;
      for (const { name, ...input } of answers) {
        const participant = await checkedInParticipant(name);
        await answerSurvey(app, participant.cookie, eventId, input);
      }
      expect((await listOf()).map((row) => row.name)).toEqual(["E", "D", "C", "B", "A"]);
      expect((await listOf("?sort=price")).map((row) => row.name)).toEqual([
        "D",
        "E",
        "B",
        "C",
        "A",
      ]);
      expect((await listOf("?tester=yes")).map((row) => row.name)).toEqual(["D", "C", "A"]);
      expect((await listOf("?tester=yes&sort=price")).map((row) => row.name)).toEqual([
        "D",
        "C",
        "A",
      ]);
      expect((await call(app, organizer, `${base}?sort=name`)).status).toBe(400);
    });

    it("別の交流会の回答は出ない。受付係・ほかの人は 403、ない交流会は 404、未ログインは 401", async () => {
      const other = await createEvent(app, organizer, { name: "別の交流会" });
      const row = await manualCheckIn(app, organizer, other.id);
      await call(
        app,
        organizer,
        `/api/v1/events/${other.id}/survey-answers/checkins/${row.id}`,
        "PUT",
        {
          concern: "別の交流会",
        },
      );
      expect(await listOf()).toEqual([]);

      const staff = await makeStaff(app, organizer, eventId);
      const stranger = await loginAs(app);
      expect((await call(app, staff.cookie, base)).status).toBe(403);
      expect((await call(app, stranger.cookie, base)).status).toBe(403);
      expect(
        (await call(app, organizer, `/api/v1/events/${MISSING_ID}/survey-answers`)).status,
      ).toBe(404);
      expect((await app.request(base)).status).toBe(401);
    });
  });

  describe("回答が消えるとき（AD-7）", () => {
    it("チェックインを取り消すと回答も消え、一覧に出ない", async () => {
      const row = await manualCheckIn(app, organizer, eventId);
      await call(app, organizer, `${base}/checkins/${row.id}`, "PUT", SAMPLE_ANSWER);
      expect(await countAnswers()).toBe(1);
      const removed = await call(
        app,
        organizer,
        `/api/v1/events/${eventId}/checkins/${row.id}`,
        "DELETE",
      );
      expect(removed.status).toBe(204);
      expect(await countAnswers()).toBe(0);
      expect(await listOf()).toEqual([]);
    });

    it("本人のアカウントを消すと、チェックインと一緒に回答も消える", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const participant = await checkedInParticipant();
      await answerSurvey(app, participant.cookie, eventId);
      const deleted = await call(
        app,
        organizer,
        `/api/v1/accounts/${participant.account.id}`,
        "DELETE",
      );
      expect(deleted.status).toBe(204);
      expect(await countAnswers()).toBe(0);
    });
  });

  describe("困りごとの CSV", () => {
    it("主催者は BOM つきの text/csv を、回答の古い順で受け取る", async () => {
      await setSurveyOpen(app, organizer, eventId, true);
      const first = await checkedInParticipant("1人目");
      await answerSurvey(app, first.cookie, eventId, { concern: "=1+1" });
      const second = await checkedInParticipant("2人目");
      await answerSurvey(app, second.cookie, eventId, { concern: null, jobRole: null });

      const response = await call(app, organizer, `${base}/export`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toMatch(
        /^attachment; filename="concerns-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder().decode(bytes.slice(3)).split("\r\n");
      expect(lines[0]).toBe("名前,困りごと,月いくら,テスター,仕事の立場,職種,入れ方,回答の時刻");
      expect(lines[1]).toMatch(/^1人目,'=1\+1,"1,000円",はい,管理職,営業,LINE,\d{4}-/);
      expect(lines[2]).toMatch(/^2人目,,"1,000円",はい,,営業,LINE,/);
    });

    it("受付係は CSV を読めない（403）", async () => {
      const staff = await makeStaff(app, organizer, eventId);
      expect((await call(app, staff.cookie, `${base}/export`)).status).toBe(403);
    });
  });
});
