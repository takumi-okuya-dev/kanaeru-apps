// 日本時間の日付と「その日の終わり」。サーバーの時刻帯に頼らない。
import { describe, expect, it } from "vitest";
import { endOfJstDate, jstDate } from "./jst.ts";

describe("日本時間の日付", () => {
  it.each([
    ["2026-11-25T14:59:59.999Z", "2026-11-25"],
    ["2026-11-25T15:00:00.000Z", "2026-11-26"],
    ["2026-11-25T15:30:00Z", "2026-11-26"],
    ["2026-11-25T19:00:00+09:00", "2026-11-25"],
    ["2026-12-31T15:00:00Z", "2027-01-01"],
    ["1969-12-31T20:00:00Z", "1970-01-01"],
  ])("%s → %s", (instant, expected) => {
    expect(jstDate(instant)).toBe(expected);
    expect(jstDate(new Date(instant))).toBe(expected);
  });

  it("読めない時刻は投げる", () => {
    expect(() => jstDate("きのう")).toThrow(RangeError);
    expect(() => endOfJstDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("その日の終わり（翌日の日本時間 0時）", () => {
  it.each([
    ["2026-11-25T15:30:00Z", "2026-11-26T15:00:00.000Z"],
    ["2026-11-25T10:00:00Z", "2026-11-25T15:00:00.000Z"],
    ["2026-11-25T00:00:00+09:00", "2026-11-25T15:00:00.000Z"],
    ["2026-11-25T23:59:59.999+09:00", "2026-11-25T15:00:00.000Z"],
    ["1969-12-31T20:00:00Z", "1970-01-01T15:00:00.000Z"],
  ])("%s → %s", (instant, expected) => {
    expect(endOfJstDate(instant).toISOString()).toBe(expected);
  });

  it("交流会の日時の日本時間の日付のうちは、終わりより前", () => {
    const eventAt = "2026-11-25T19:00:00+09:00";
    const end = endOfJstDate(eventAt);
    expect(new Date("2026-11-25T23:59:59+09:00") < end).toBe(true);
    expect(new Date("2026-11-26T00:00:00+09:00") < end).toBe(false);
  });
});
