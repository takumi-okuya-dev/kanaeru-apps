// 退会の確かめの中身の約束（AD-22）：種類は組織・引き継ぐ・消すの3つ。
import { describe, expect, it } from "vitest";
import { WITHDRAWAL_ITEM_KINDS, WithdrawalPreview } from "./index.ts";

describe("退会の確かめの中身", () => {
  it("種類は組織・引き継ぐ・消すで、出典と文を持つ", () => {
    expect(WITHDRAWAL_ITEM_KINDS).toEqual(["organization", "handover", "delete"]);
    expect(
      WithdrawalPreview.safeParse({
        items: [{ kind: "handover", source: "Threads", text: "引き継ぎます。" }],
      }).success,
    ).toBe(true);
    expect(
      WithdrawalPreview.safeParse({ items: [{ kind: "other", source: "x", text: "y" }] }).success,
    ).toBe(false);
  });
});
