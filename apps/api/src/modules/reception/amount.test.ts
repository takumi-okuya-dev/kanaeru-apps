// 金額の決め方の単体のテスト（reception-002 research R5）。
import { describe, expect, it } from "vitest";
import { decideAmount } from "./amount.ts";

describe("金額の決め方", () => {
  it("割引なしは参加費・無料は0円", () => {
    expect(decideAmount("paypay", 5000)).toBe(5000);
    expect(decideAmount("cash", 5000, null)).toBe(5000);
    expect(decideAmount("free", 5000)).toBe(0);
  });

  it("割引があれば参加費から引く", () => {
    expect(decideAmount("paypay", 5000, 1000)).toBe(4000);
    expect(decideAmount("cash", 5000, 1000)).toBe(4000);
  });

  it("割引が参加費より大きくても0円で止める", () => {
    expect(decideAmount("paypay", 500, 1000)).toBe(0);
    expect(decideAmount("paypay", 1000, 1000)).toBe(0);
  });

  it("無料は割引があっても0円", () => {
    expect(decideAmount("free", 5000, 1000)).toBe(0);
  });
});
