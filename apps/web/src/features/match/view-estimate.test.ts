// 見るだけのページの今の試合の見込み（FR-M15。match-005）。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { estimateNowIndex, nowIndexOf } from "./view-estimate.ts";

const MINUTE = 60_000;

/**
 * 試合を作る。
 * @param marks 終わったかの並び（1 が終わった）
 * @returns 試合
 */
function games(marks: string): { done: boolean }[] {
  return [...marks].map((mark) => ({ done: mark === "1" }));
}

describe("estimateNowIndex", () => {
  it("過ぎた時間を1試合の長さで割った数だけ進め、チェックの付いた試合は飛ばす", () => {
    const list = games("110100");
    expect(nowIndexOf(list)).toBe(2);
    expect(estimateNowIndex(list, 0, 15, 14 * MINUTE)).toBe(2);
    expect(estimateNowIndex(list, 0, 15, 15 * MINUTE)).toBe(4);
    expect(estimateNowIndex(list, 0, 15, 30 * MINUTE)).toBe(5);
    expect(estimateNowIndex(list, 0, 15, 300 * MINUTE)).toBe(6);
  });

  it("見込みは読んだときの今より前に戻らず、試合の数を超えない（property-based）", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 40 }),
        fc.integer({ min: 5, max: 90 }),
        fc.integer({ min: -10_000, max: 600 }),
        (marks, minutes, elapsed) => {
          const list = marks.map((done) => ({ done }));
          const estimate = estimateNowIndex(list, 0, minutes, elapsed * MINUTE);
          expect(estimate).toBeGreaterThanOrEqual(nowIndexOf(list));
          expect(estimate).toBeLessThanOrEqual(list.length);
          if (estimate < list.length) expect(list[estimate]?.done).toBe(false);
        },
      ),
    );
  });
});
