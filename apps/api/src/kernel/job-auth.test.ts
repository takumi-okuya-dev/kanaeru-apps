// 定期の仕事からの要求の確かめの単体のテスト。
import { describe, expect, it } from "vitest";
import { createJobRequestCheck } from "./job-auth.ts";

describe("定期の仕事からの要求の確かめ", () => {
  it("Bearer と合言葉が合うときだけ通す", () => {
    const check = createJobRequestCheck("s".repeat(32));
    expect(check(`Bearer ${"s".repeat(32)}`)).toBe(true);
    expect(check(`Bearer ${"s".repeat(31)}`)).toBe(false);
    expect(check("s".repeat(32))).toBe(false);
    expect(check(undefined)).toBe(false);
  });

  it("合言葉の設定がなければ、いつも通さない", () => {
    const check = createJobRequestCheck(undefined);
    expect(check("Bearer ")).toBe(false);
    expect(check(undefined)).toBe(false);
  });
});
