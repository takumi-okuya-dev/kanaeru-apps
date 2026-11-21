// 定員と枠の入力の単体のテスト（booking-004 research R1・S12）：枠の合計・定員なしで枠・同じ媒体・直接・URL の形・範囲。
import { describe, expect, it } from "vitest";
import { CAPACITY_MAX, CapacityInput, OfferAnswerInput, QUOTAS_MAX } from "./index.ts";

const PEATIX = { applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/m" };

describe("定員と枠の入力", () => {
  it("定員と枠（合計が定員まで）・定員なしで枠なしは通る", () => {
    expect(CapacityInput.safeParse({ capacity: 4, quotas: [PEATIX] }).success).toBe(true);
    expect(CapacityInput.safeParse({ capacity: null, quotas: [] }).success).toBe(true);
    expect(
      CapacityInput.safeParse({ capacity: 10, quotas: [{ ...PEATIX, manageUrl: null }] }).success,
    ).toBe(true);
  });

  it("枠の合計が定員を超える・定員なしで枠・同じ媒体は、欄のそばの文で止まる", () => {
    const over = CapacityInput.safeParse({ capacity: 3, quotas: [PEATIX] });
    expect(over.error?.issues[0]?.message).toContain("定員を超えています");
    const noCapacity = CapacityInput.safeParse({ capacity: null, quotas: [PEATIX] });
    expect(noCapacity.error?.issues[0]?.path).toEqual(["capacity"]);
    const twice = CapacityInput.safeParse({ capacity: 10, quotas: [PEATIX, PEATIX] });
    expect(twice.error?.issues[0]?.message).toContain("同じ媒体");
  });

  it("直接の枠・http(s) でない URL・範囲の外は止まる", () => {
    expect(
      CapacityInput.safeParse({
        capacity: 10,
        quotas: [{ ...PEATIX, applicationSource: "direct" }],
      }).success,
    ).toBe(false);
    expect(
      CapacityInput.safeParse({
        capacity: 10,
        quotas: [{ ...PEATIX, manageUrl: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(CapacityInput.safeParse({ capacity: 0, quotas: [] }).success).toBe(false);
    expect(CapacityInput.safeParse({ capacity: CAPACITY_MAX + 1, quotas: [] }).success).toBe(false);
    expect(QUOTAS_MAX).toBe(3);
  });

  it("返事は参加するか辞退するだけ", () => {
    expect(OfferAnswerInput.safeParse({ answer: "accept" }).success).toBe(true);
    expect(OfferAnswerInput.safeParse({ answer: "maybe" }).success).toBe(false);
  });
});
