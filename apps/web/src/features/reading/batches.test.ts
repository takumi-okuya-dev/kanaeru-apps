// 束に分ける：件数の上限・大きさの上限・順を保つ。
import { describe, expect, it } from "vitest";
import { splitIntoBatches } from "./batches.ts";

/**
 * 見本のマーカー。
 * @param n 番号
 * @param text 文
 * @returns マーカー
 */
function marker(n: number, text = `マーカー ${n}`) {
  return { text, page: n, position: n, question: false };
}

describe("束に分ける", () => {
  it("件数の上限で分け、順を保つ", () => {
    const markers = Array.from({ length: 7 }, (_, i) => marker(i + 1));
    const batches = splitIntoBatches("goodnotes", markers, {
      batchBytes: 1_000_000,
      markersPerBatch: 3,
    });
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 1]);
    expect(batches.flat().map((item) => item.page)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("大きさの上限で分け、どの束も上限をこえない", () => {
    const markers = Array.from({ length: 10 }, (_, i) => marker(i + 1, "あ".repeat(100)));
    const limit = 1_000;
    const batches = splitIntoBatches("goodnotes", markers, {
      batchBytes: limit,
      markersPerBatch: 500,
    });
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(
        new TextEncoder().encode(JSON.stringify({ source: "goodnotes", markers: batch })).length,
      ).toBeLessThanOrEqual(limit);
    }
    expect(batches.flat()).toHaveLength(10);
  });

  it("空なら束はない", () => {
    expect(splitIntoBatches("paste", [])).toEqual([]);
  });

  it("既定の上限（90KB・500件）では、上限いっぱいの文の5,000件も API の上限（100KB）をこえない", () => {
    const markers = Array.from({ length: 5_000 }, (_, i) => marker(i + 1, "あ".repeat(50)));
    for (const batch of splitIntoBatches("goodnotes", markers)) {
      expect(batch.length).toBeLessThanOrEqual(500);
      expect(
        new TextEncoder().encode(JSON.stringify({ source: "goodnotes", markers: batch })).length,
      ).toBeLessThanOrEqual(100 * 1024);
    }
  });
});
