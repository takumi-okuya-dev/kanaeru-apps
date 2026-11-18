// アンケートの約束：入力の形・正規化・選択肢の並びと言葉・高い順・エラーの code。
import { describe, expect, it } from "vitest";
import {
  CONCERN_MAX,
  JOB_ROLES,
  JOB_ROLE_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  MONTHLY_PRICES,
  MONTHLY_PRICE_LABELS,
  SURVEY_ERRORS,
  SurveyAnswerInput,
  SurveyListQuery,
  TESTER_ANSWER_LABELS,
  compareByMonthlyPrice,
  normalizeSurveyAnswer,
} from "./index.ts";
import type { MonthlyPrice } from "./index.ts";

/**
 * 誤りを、欄の道と文の組にする。
 * @param value 確かめる値
 * @returns 欄の道と文の並び
 */
function issuesOf(value: unknown): [string, string][] {
  const result = SurveyAnswerInput.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]);
}

describe("アンケートの回答の入力", () => {
  it("どの欄も省略でき、空の入力も通る（必須にしない）", () => {
    expect(SurveyAnswerInput.safeParse({}).success).toBe(true);
    expect(
      SurveyAnswerInput.safeParse({
        concern: null,
        monthlyPrice: null,
        tester: null,
        jobRole: null,
        jobType: null,
      }).success,
    ).toBe(true);
  });

  it("全部の欄を入れた入力が通り、困りごとの前後の空白を除く", () => {
    const parsed = SurveyAnswerInput.parse({
      concern: "  部下にAIをどう使わせればいいか分からない \n",
      monthlyPrice: "jpy1000",
      tester: "yes",
      jobRole: "manager",
      jobType: "sales",
    });
    expect(parsed.concern).toBe("部下にAIをどう使わせればいいか分からない");
  });

  it("知らない code・知らない欄・長すぎる困りごとは、欄ごとの日本語の理由で誤り", () => {
    expect(issuesOf({ monthlyPrice: "jpy100" })).toEqual([
      ["monthlyPrice", "実現したら月いくらなら使うかは、選択肢から選んでください。"],
    ]);
    expect(issuesOf({ jobType: "chef" })).toEqual([
      ["jobType", "職種は、選択肢から選んでください。"],
    ]);
    expect(issuesOf({ concern: "あ".repeat(CONCERN_MAX + 1) })).toEqual([
      ["concern", "困りごとは2,000文字までにしてください。"],
    ]);
    expect(issuesOf({ concern: "あ".repeat(CONCERN_MAX) })).toEqual([]);
    expect(issuesOf({ name: "佐藤" }).map(([path]) => path)).toEqual([""]);
  });

  it("正規化で、省略と空白だけの困りごとを null にする", () => {
    expect(normalizeSurveyAnswer(SurveyAnswerInput.parse({ concern: "   " }))).toEqual({
      concern: null,
      monthlyPrice: null,
      tester: null,
      jobRole: null,
      jobType: null,
    });
    expect(
      normalizeSurveyAnswer(SurveyAnswerInput.parse({ concern: "困る", tester: "no" })),
    ).toMatchObject({ concern: "困る", tester: "no" });
  });
});

describe("選択肢", () => {
  it("言葉は PRD FR-10 のとおりで、並びは画面の順", () => {
    expect(MONTHLY_PRICES.map((value) => MONTHLY_PRICE_LABELS[value])).toEqual([
      "0円",
      "500円",
      "1,000円",
      "3,000円以上",
      "分からない",
    ]);
    expect(Object.values(TESTER_ANSWER_LABELS)).toEqual(["はい", "いいえ"]);
    expect(JOB_ROLES.map((value) => JOB_ROLE_LABELS[value])).toEqual([
      "経営者",
      "管理職",
      "会社員",
      "フリーランス",
      "学生",
      "その他",
    ]);
    expect(JOB_TYPES.map((value) => JOB_TYPE_LABELS[value])).toEqual([
      "エンジニア",
      "デザイナー",
      "営業",
      "マーケティング",
      "企画・PM",
      "事務・管理部門（人事・経理・総務など）",
      "経営",
      "その他",
    ]);
  });

  it("月いくらの高い順：3,000円以上 → 1,000円 → 500円 → 0円 → 分からない → 答えていない", () => {
    const values: (MonthlyPrice | null)[] = [
      null,
      "unknown",
      "jpy0",
      "jpy3000plus",
      "jpy500",
      "jpy1000",
    ];
    expect([...values].sort(compareByMonthlyPrice)).toEqual([
      "jpy3000plus",
      "jpy1000",
      "jpy500",
      "jpy0",
      "unknown",
      null,
    ]);
  });
});

describe("一覧の問い合わせとエラー", () => {
  it("tester は yes だけ、sort は newest・price だけ", () => {
    expect(SurveyListQuery.safeParse({ tester: "yes", sort: "price" }).success).toBe(true);
    expect(SurveyListQuery.safeParse({}).success).toBe(true);
    expect(SurveyListQuery.safeParse({ tester: "no" }).success).toBe(false);
    expect(SurveyListQuery.safeParse({ sort: "name" }).success).toBe(false);
  });

  it("エラーの code と状態の番号", () => {
    expect(SURVEY_ERRORS.SURVEY_CLOSED).toMatchObject({ code: "SURVEY_CLOSED", status: 409 });
    expect(SURVEY_ERRORS.SURVEY_NOT_CHECKED_IN).toMatchObject({
      code: "SURVEY_NOT_CHECKED_IN",
      status: 403,
    });
  });
});
