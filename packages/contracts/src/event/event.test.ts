// 交流会の約束：入力の形・誤りの文・答えの形・エラーの code。
import { describe, expect, it } from "vitest";
import {
  EVENT_ERRORS,
  EVENT_ACCESS_ROLES,
  EVENT_ACCESS_ROLE_LABELS,
  EVENT_ROLES,
  EVENT_ROLE_LABELS,
  EventInput,
  EventOrganizationInput,
  EventOrganizationState,
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

describe("割引の入力（reception-002）", () => {
  it("名前の前後の空白を除き、紹介者を聞くかは送らなくてもよい", () => {
    const parsed = EventInput.parse({
      ...VALID,
      discounts: [
        { name: " 紹介割 ", amount: 1000 },
        { name: "学割", amount: 500, asksReferrer: true },
      ],
    });
    expect(parsed.discounts).toEqual([
      { name: "紹介割", amount: 1000 },
      { name: "学割", amount: 500, asksReferrer: true },
    ]);
  });

  it("送らなければ discounts はない（割引を変えない）", () => {
    expect(EventInput.parse(VALID).discounts).toBeUndefined();
  });

  it("名前は1〜30文字・額は1円以上の整数", () => {
    expect(issuesOf({ ...VALID, discounts: [{ name: " ", amount: 1000 }] })).toEqual([
      ["discounts.0.name", "割引の名前を入れてください。"],
    ]);
    expect(issuesOf({ ...VALID, discounts: [{ name: "あ".repeat(31), amount: 1000 }] })).toEqual([
      ["discounts.0.name", "割引の名前は30文字までにしてください。"],
    ]);
    expect(issuesOf({ ...VALID, discounts: [{ name: "紹介割", amount: 0 }] })).toEqual([
      ["discounts.0.amount", "割引の額は1円以上にしてください。"],
    ]);
    expect(issuesOf({ ...VALID, discounts: [{ name: "紹介割", amount: 1.5 }] })).toEqual([
      ["discounts.0.amount", "割引の額は円の整数で入れてください。"],
    ]);
  });

  it("同じ名前は、2つ目の名前の欄の誤り（前後の空白を除いて比べる）", () => {
    expect(
      issuesOf({
        ...VALID,
        discounts: [
          { name: "紹介割", amount: 1000 },
          { name: " 紹介割", amount: 500 },
        ],
      }),
    ).toEqual([["discounts.1.name", "同じ名前の割引があります。別の名前にしてください。"]]);
  });

  it("11個は誤り・知らない欄は誤り", () => {
    const many = Array.from({ length: 11 }, (_, index) => ({ name: `割引${index}`, amount: 100 }));
    expect(issuesOf({ ...VALID, discounts: many })).toEqual([
      ["discounts", "割引は10個までにしてください。"],
    ]);
    expect(
      EventInput.safeParse({ ...VALID, discounts: [{ name: "a", amount: 1, rate: 10 }] }).success,
    ).toBe(false);
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
      discounts: [
        {
          id: "0193a1b2-0000-7000-8000-000000000001",
          name: "紹介割",
          amount: 1000,
          asksReferrer: true,
        },
      ],
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

  it("判定の役目は主催者・受付係・部員で、画面の言葉を持つ（event-002）", () => {
    expect([...EVENT_ACCESS_ROLES]).toEqual(expect.arrayContaining([...EVENT_ROLES, "member"]));
    expect(EVENT_ACCESS_ROLE_LABELS.member).toBe("部員");
    for (const role of EVENT_ACCESS_ROLES) {
      expect(EVENT_ACCESS_ROLE_LABELS[role]).toMatch(/[ぁ-んァ-ン一-龠]/);
    }
  });

  it("組織に入れるの入力は uuid か null だけ（event-002）", () => {
    const id = "0193a1b2-0000-7000-8000-000000000001";
    expect(EventOrganizationInput.parse({ organizationId: id })).toEqual({ organizationId: id });
    expect(EventOrganizationInput.parse({ organizationId: null })).toEqual({
      organizationId: null,
    });
    expect(EventOrganizationInput.safeParse({ organizationId: "x" }).success).toBe(false);
    expect(EventOrganizationInput.safeParse({}).success).toBe(false);
    expect(EventOrganizationInput.safeParse({ organizationId: null, extra: true }).success).toBe(
      false,
    );
  });

  it("持ち主と組織の状態は、持ち主・組織・持ち主か・選べる組織を持つ（event-002）", () => {
    const state = {
      owner: { accountId: "0193a1b2-0000-7000-8000-000000000001", displayName: "高橋" },
      organization: null,
      isOwner: true,
      options: [{ id: "0193a1b2-0000-7000-8000-000000000002", name: "バドミントンの部" }],
    };
    expect(EventOrganizationState.parse(state)).toEqual(state);
    expect(EventOrganizationState.parse({ ...state, owner: null }).owner).toBeNull();
  });

  it("エラーは code・状態の番号・日本語の文を持ち、403・404 は土台と同じ code", () => {
    expect(EVENT_ERRORS.EVENT_OWNER_ONLY).toMatchObject({ status: 403 });
    expect(EVENT_ERRORS.EVENT_ORGANIZATION_NOT_FOUND).toMatchObject({ status: 404 });
    expect(EVENT_ERRORS.FORBIDDEN).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(EVENT_ERRORS.NOT_FOUND).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(EVENT_ERRORS.STAFF_INVITE_EXPIRED).toMatchObject({ status: 410 });
    for (const spec of Object.values(EVENT_ERRORS)) expect(spec.message).toMatch(/[ぁ-ん]/);
  });
});
