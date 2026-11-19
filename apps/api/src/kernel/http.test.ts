// 領域の道で共に使う手伝いのうち、CSV を返すヘッダー（core-004 R3）の確かめ。
import { describe, expect, it } from "vitest";
import { csvAttachment } from "./http.ts";

describe("csvAttachment", () => {
  it("CSV の種類と、日本時間の日付つきのファイル名の添付を返す", () => {
    expect(csvAttachment("participants", new Date("2026-11-25T10:00:00Z"))).toEqual({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="participants-2026-11-25.csv"',
    });
  });

  it("日付は日本時間で決める（UTC ではまだ前の日）", () => {
    expect(csvAttachment("concerns", new Date("2026-11-25T15:30:00Z"))["Content-Disposition"]).toBe(
      'attachment; filename="concerns-2026-11-26.csv"',
    );
  });

  it.each(["", "Participants", "a b", 'x"', "参加者", "a/b", "a\r\nb"])(
    "使えない名前（%j）は投げる（ヘッダーの差しこみを防ぐ）",
    (name) => {
      expect(() => csvAttachment(name)).toThrow(RangeError);
    },
  );
});
