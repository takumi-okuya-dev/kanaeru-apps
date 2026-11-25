// 受付の約束：入力の形・誤りの文・選択肢・同じ名前の比べ方・エラーの code。
import { describe, expect, it } from "vitest";
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  CheckinInput,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECEPTION_ERRORS,
  REFERRALS,
  REFERRAL_LABELS,
  normalizeCheckinName,
} from "./index.ts";

/** 正しい入力。 */
const VALID = {
  name: " 佐藤 太郎 ",
  applicationSource: "connpass",
  referral: "friend",
  paymentMethod: "paypay",
};

/**
 * 誤りを、欄の道と文の組にする。
 * @param value 確かめる値
 * @returns 欄の道と文の並び
 */
function issuesOf(value: unknown): [string, string][] {
  const result = CheckinInput.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]);
}

describe("チェックインの入力", () => {
  it("名前の前後の空白を除く（間の空白は残す）", () => {
    expect(CheckinInput.parse(VALID)).toEqual({ ...VALID, name: "佐藤 太郎" });
  });

  it("選んでいない設問は、設問の名前を入れた日本語の理由", () => {
    expect(issuesOf({ name: " " })).toEqual([
      ["name", "名前を入れてください。"],
      ["applicationSource", "申し込みの媒体を選んでください。"],
      ["referral", "知ったきっかけを選んでください。"],
      ["paymentMethod", "支払い方法を選んでください。"],
    ]);
  });

  it("知らない選択肢・長すぎる名前・知らない欄（金額）は誤り", () => {
    expect(issuesOf({ ...VALID, paymentMethod: "card" })).toEqual([
      ["paymentMethod", "支払い方法を選んでください。"],
    ]);
    expect(issuesOf({ ...VALID, name: "あ".repeat(51) })).toEqual([
      ["name", "名前は50文字までにしてください。"],
    ]);
    expect(CheckinInput.safeParse({ ...VALID, amount: 0 }).success).toBe(false);
  });
});

describe("割引と紹介者の入力（reception-002）", () => {
  const discountId = "0193a1b2-0000-7000-8000-000000000001";

  it("割引と紹介者は送らなくてもよい（割引なし）", () => {
    const parsed = CheckinInput.parse(VALID);
    expect(parsed.discountId).toBeUndefined();
    expect(parsed.referrerName).toBeUndefined();
  });

  it("割引の ID と、紹介者の名前（前後の空白を除く）を受ける。null も受ける", () => {
    expect(CheckinInput.parse({ ...VALID, discountId, referrerName: " 田中 花子 " })).toMatchObject(
      { discountId, referrerName: "田中 花子" },
    );
    expect(CheckinInput.parse({ ...VALID, discountId: null, referrerName: null })).toMatchObject({
      discountId: null,
      referrerName: null,
    });
  });

  it("割引の ID の形が違う・紹介者の名前が長すぎるのは、欄の道つきの日本語の誤り", () => {
    expect(issuesOf({ ...VALID, discountId: "x" })).toEqual([
      ["discountId", "割引を選び直してください。"],
    ]);
    expect(issuesOf({ ...VALID, discountId, referrerName: "あ".repeat(51) })).toEqual([
      ["referrerName", "紹介してくれた人の名前は50文字までにしてください。"],
    ]);
  });

  it("選べない割引は 400 と日本語の文", () => {
    expect(RECEPTION_ERRORS.DISCOUNT_UNAVAILABLE).toMatchObject({
      code: "DISCOUNT_UNAVAILABLE",
      status: 400,
    });
    expect(RECEPTION_ERRORS.DISCOUNT_UNAVAILABLE.message).toMatch(/[ぁ-ん]/);
  });
});

describe("選択肢", () => {
  it("PRD FR-4 の順と言葉", () => {
    expect(APPLICATION_SOURCES.map((code) => APPLICATION_SOURCE_LABELS[code])).toEqual([
      "connpass",
      "Peatix",
      "直接",
      "その他",
    ]);
    expect(REFERRALS.map((code) => REFERRAL_LABELS[code])).toEqual([
      "知人の紹介",
      "SNS",
      "connpass などの告知",
      "その他",
    ]);
    expect(PAYMENT_METHODS.map((code) => PAYMENT_METHOD_LABELS[code])).toEqual([
      "PayPay",
      "現金",
      "無料（招待など）",
    ]);
  });

  it("code は英語の小文字", () => {
    for (const code of [...APPLICATION_SOURCES, ...REFERRALS, ...PAYMENT_METHODS]) {
      expect(code).toMatch(/^[a-z]+$/);
    }
  });
});

describe("同じ名前の比べ方", () => {
  it("前後と間の空白を消し、全角・半角をそろえる", () => {
    expect(normalizeCheckinName(" 佐藤　太郎 ")).toBe("佐藤太郎");
    expect(normalizeCheckinName("ｻﾄｳ Taro")).toBe(normalizeCheckinName("サトウＴａｒｏ"));
    expect(normalizeCheckinName("佐藤太郎")).not.toBe(normalizeCheckinName("佐藤次郎"));
  });
});

describe("エラー", () => {
  it("チェックインがないのは 404 と日本語の文", () => {
    expect(RECEPTION_ERRORS.CHECKIN_NOT_FOUND).toMatchObject({
      code: "CHECKIN_NOT_FOUND",
      status: 404,
    });
    expect(RECEPTION_ERRORS.CHECKIN_NOT_FOUND.message).toMatch(/[ぁ-ん]/);
  });
});
