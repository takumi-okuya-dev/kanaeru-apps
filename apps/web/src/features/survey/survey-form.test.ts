// アンケートの欄の値と入力の行き来：初めの値（選択肢の設問は「答えない」）・前の回答から・「答えない」と空は null・長すぎる困りごと。
import { describe, expect, it } from "vitest";
import {
  JOB_ROLE_OPTIONS,
  JOB_TYPE_OPTIONS,
  MONTHLY_PRICE_OPTIONS,
  NOT_ANSWERED,
  TESTER_OPTIONS,
} from "./format.ts";
import { EMPTY_SURVEY_FORM, surveyFormFromAnswer, validateSurveyForm } from "./survey-form.ts";

describe("アンケートの欄", () => {
  it("初めは選択肢の設問がどれも「答えない」で、そのまま送ると全部 null", () => {
    expect(EMPTY_SURVEY_FORM).toMatchObject({
      monthlyPrice: NOT_ANSWERED,
      tester: NOT_ANSWERED,
      jobRole: NOT_ANSWERED,
      jobType: NOT_ANSWERED,
    });
    expect(validateSurveyForm(EMPTY_SURVEY_FORM)).toEqual({
      ok: true,
      input: { concern: null, monthlyPrice: null, tester: null, jobRole: null, jobType: null },
    });
  });

  it("前の回答から欄を作り、そのまま送ると同じ入力になる", () => {
    const answer = {
      concern: "議事録",
      monthlyPrice: "jpy500",
      tester: null,
      jobRole: null,
      jobType: "sales",
      answeredAt: "2026-11-25T12:00:00.000Z",
    } as const;
    const values = surveyFormFromAnswer(answer);
    expect(values).toEqual({
      concern: "議事録",
      monthlyPrice: "jpy500",
      tester: NOT_ANSWERED,
      jobRole: NOT_ANSWERED,
      jobType: "sales",
    });
    expect(validateSurveyForm({ ...values, concern: "  議事録 " })).toEqual({
      ok: true,
      input: {
        concern: "議事録",
        monthlyPrice: "jpy500",
        tester: null,
        jobRole: null,
        jobType: "sales",
      },
    });
    expect(surveyFormFromAnswer(null)).toEqual(EMPTY_SURVEY_FORM);
  });

  it("長すぎる困りごとは欄の誤り", () => {
    expect(validateSurveyForm({ ...EMPTY_SURVEY_FORM, concern: "あ".repeat(2001) })).toEqual({
      ok: false,
      errors: { concern: "困りごとは2,000文字までにしてください。" },
    });
  });

  it("選択肢の設問のチップは、どれも最後に「答えない」（必須にしないので選んだあとも戻せる）", () => {
    for (const options of [MONTHLY_PRICE_OPTIONS, TESTER_OPTIONS, JOB_ROLE_OPTIONS]) {
      expect(options.at(-1)).toEqual({ value: NOT_ANSWERED, label: "答えない" });
    }
    expect(TESTER_OPTIONS.map((option) => option.label)).toEqual(["はい", "いいえ", "答えない"]);
    expect(validateSurveyForm({ ...EMPTY_SURVEY_FORM, monthlyPrice: "jpy0" })).toMatchObject({
      input: { monthlyPrice: "jpy0" },
    });
    expect(JOB_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "エンジニア",
      "デザイナー",
      "営業",
      "マーケティング",
      "企画・PM",
      "事務・管理部門（人事・経理・総務など）",
      "経営",
      "その他",
      "答えない",
    ]);
  });
});
