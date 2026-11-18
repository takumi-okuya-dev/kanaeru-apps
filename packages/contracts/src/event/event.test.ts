// 交流会の約束：入力の形・誤りの文・答えの形・エラーの code。
import { describe, expect, it } from "vitest";
import {
  EVENT_ERRORS,
  EVENT_ROLES,
  EVENT_ROLE_LABELS,
  EventInput,
  EventSummary,
  STAFF_INVITE_TOKEN_FORMAT,
  SurveyStateInput,
} from "./index.ts";

/** 正しい入力。 */
const VALID = {
  name: " 11月の交流会 ",
  startsAt: "2026-11-25T19:00:00+09:00",
  venue: " 渋谷の会場 ",
  fee: 1000,
};

/**
 * 誤りを、欄の道と文の組にする。
 * @param value 確かめる値
 * @returns 欄の道と文の並び
 */
function issuesOf(value: unknown): [string, string][] {
  const result = EventInput.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]);
}

describe("交流会の入力", () => {
  it("名前と会場の前後の空白を除き、任意の URL はなくてもよい", () => {
    expect(EventInput.parse(VALID)).toEqual({
      name: "11月の交流会",
      startsAt: "2026-11-25T19:00:00+09:00",
      venue: "渋谷の会場",
      fee: 1000,
    });
  });

  it("参加費は0円も入れられる", () => {
    expect(EventInput.parse({ ...VALID, fee: 0 }).fee).toBe(0);
  });

  it("https の URL・空の文字・null を受け取り、ほかの URL は誤り", () => {
    const parsed = EventInput.parse({
      ...VALID,
      googleFormUrl: " https://forms.gle/abc ",
      lineGroupUrl: "",
    });
    expect(parsed.googleFormUrl).toBe("https://forms.gle/abc");
    expect(parsed.lineGroupUrl).toBe("");
    expect(EventInput.parse({ ...VALID, googleFormUrl: null }).googleFormUrl).toBeNull();
    expect(issuesOf({ ...VALID, googleFormUrl: "http://forms.gle/abc" })).toEqual([
      ["googleFormUrl", "GoogleフォームのURLは https:// で始まる URL を入れてください。"],
    ]);
    expect(issuesOf({ ...VALID, lineGroupUrl: "javascript:alert(1)" })).toEqual([
      ["lineGroupUrl", "LINEグループの招待リンクは https:// で始まる URL を入れてください。"],
    ]);
  });

  it("名前・会場の空、時差のない日時、負や小数の参加費は、欄ごとに日本語の理由", () => {
    expect(issuesOf({ name: " ", startsAt: "2026-11-25T19:00", venue: "", fee: -1 })).toEqual([
      ["name", "交流会の名前を入れてください。"],
      ["startsAt", "日時を入れてください。"],
      ["venue", "会場を入れてください。"],
      ["fee", "参加費は0円以上にしてください。"],
    ]);
    expect(issuesOf({ ...VALID, fee: 10.5 })).toEqual([
      ["fee", "参加費は円の整数で入れてください。"],
    ]);
    expect(issuesOf({ ...VALID, fee: "1000" })).toEqual([
      ["fee", "参加費を数字で入れてください。"],
    ]);
    expect(issuesOf({ ...VALID, name: "あ".repeat(101) })).toEqual([
      ["name", "交流会の名前は100文字までにしてください。"],
    ]);
  });

  it("知らない欄（アンケートの開閉など）は誤り", () => {
    expect(EventInput.safeParse({ ...VALID, surveyOpen: true }).success).toBe(false);
  });
});

describe("交流会のほかの形", () => {
  it("要約は決めた欄だけを持つ（URL はなければ null）", () => {
    const summary = {
      id: "0193a1b2-0000-7000-8000-000000000000",
      name: "交流会",
      startsAt: "2026-11-25T10:00:00.000Z",
      venue: "会場",
      fee: 0,
      surveyOpen: false,
      googleFormUrl: null,
      lineGroupUrl: null,
      openChatUrl: null,
    };
    expect(EventSummary.parse(summary)).toEqual(summary);
    expect(Object.keys(EventSummary.shape).sort()).toEqual(Object.keys(summary).sort());
  });

  it("アンケートの開閉は真偽だけ", () => {
    expect(SurveyStateInput.parse({ open: true })).toEqual({ open: true });
    expect(SurveyStateInput.safeParse({ open: "true" }).success).toBe(false);
  });

  it("招待の印は 43 文字の base64url", () => {
    expect(STAFF_INVITE_TOKEN_FORMAT.test("a".repeat(43))).toBe(true);
    expect(STAFF_INVITE_TOKEN_FORMAT.test("a".repeat(42))).toBe(false);
    expect(STAFF_INVITE_TOKEN_FORMAT.test(`${"a".repeat(42)}/`)).toBe(false);
  });

  it("役目は主催者と受付係で、画面の言葉を持つ", () => {
    for (const role of EVENT_ROLES) expect(EVENT_ROLE_LABELS[role]).toMatch(/[ぁ-んァ-ン一-龠]/);
  });

  it("エラーは code・状態の番号・日本語の文を持ち、403・404 は土台と同じ code", () => {
    expect(EVENT_ERRORS.FORBIDDEN).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(EVENT_ERRORS.NOT_FOUND).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(EVENT_ERRORS.STAFF_INVITE_EXPIRED).toMatchObject({ status: 410 });
    for (const spec of Object.values(EVENT_ERRORS)) expect(spec.message).toMatch(/[ぁ-ん]/);
  });
});
