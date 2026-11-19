// 受付の値の見せ方：チップの並びと言葉・日本時間の時刻・人数。
import { describe, expect, it } from "vitest";
import {
  APPLICATION_SOURCE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  REFERRAL_OPTIONS,
  formatCheckinTime,
  formatCount,
} from "./format.ts";

describe("受付の値の見せ方", () => {
  it("チップは約束の並びと言葉", () => {
    expect(APPLICATION_SOURCE_OPTIONS.map((option) => option.label)).toEqual([
      "connpass",
      "Peatix",
      "直接",
      "その他",
    ]);
    expect(REFERRAL_OPTIONS.map((option) => option.value)).toEqual([
      "friend",
      "sns",
      "announcement",
      "other",
    ]);
    expect(PAYMENT_METHOD_OPTIONS.map((option) => option.label)).toEqual([
      "PayPay",
      "現金",
      "無料（招待など）",
    ]);
  });

  it("時刻は日本時間の HH:mm", () => {
    expect(formatCheckinTime("2026-11-25T10:03:00.000Z")).toBe("19:03");
    expect(formatCheckinTime("2026-11-25T15:30:00.000Z")).toBe("00:30");
  });

  it("人数は「人」を付けて3桁ごとに区切る", () => {
    expect(formatCount(0)).toBe("0人");
    expect(formatCount(1234)).toBe("1,234人");
  });
});
