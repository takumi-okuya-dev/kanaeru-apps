// 夜間の停止の時間帯（日本時間 0時〜8時）と、DB に届かないときの文の選び方。サーバーの時刻帯に頼らない。
import { describe, expect, it } from "vitest";
import {
  CORE_ERROR_MESSAGES,
  DB_UNAVAILABLE_MESSAGES,
  coreErrorMessage,
  dbUnavailableMessage,
} from "./messages.ts";
import { isNightStopWindow } from "./night-stop.ts";

describe("夜間の停止の時間帯", () => {
  it.each([
    ["2026-11-25T00:00:00+09:00", true],
    ["2026-11-25T03:30:00+09:00", true],
    ["2026-11-25T07:59:59.999+09:00", true],
    ["2026-11-25T08:00:00+09:00", false],
    ["2026-11-25T12:00:00+09:00", false],
    ["2026-11-25T23:59:59.999+09:00", false],
    // UTC では前の日の 15時〜23時が、日本時間の 0時〜8時
    ["2026-11-24T15:00:00Z", true],
    ["2026-11-24T22:59:59Z", true],
    ["2026-11-24T23:00:00Z", false],
    ["2026-11-24T14:59:59Z", false],
  ])("%s → %s", (instant, expected) => {
    expect(isNightStopWindow(new Date(instant))).toBe(expected);
  });

  it("読めない時刻は投げる", () => {
    expect(() => isNightStopWindow(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("DB に届かないときの文", () => {
  it("夜間の停止の時間帯は夜間の文、ほかは一時的な文", () => {
    const night = new Date("2026-11-25T02:00:00+09:00");
    const day = new Date("2026-11-25T14:00:00+09:00");
    expect(dbUnavailableMessage(night)).toBe(
      "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。",
    );
    expect(dbUnavailableMessage(day)).toBe(
      "一時的につながりません。少し待ってから、もう一度開いてください。",
    );
    expect(coreErrorMessage("DB_UNAVAILABLE", night)).toBe(DB_UNAVAILABLE_MESSAGES.nightStop);
    expect(coreErrorMessage("DB_UNAVAILABLE", day)).toBe(DB_UNAVAILABLE_MESSAGES.temporary);
  });

  it("ほかの code は時刻で変わらない", () => {
    const night = new Date("2026-11-25T02:00:00+09:00");
    expect(coreErrorMessage("INTERNAL", night)).toBe(CORE_ERROR_MESSAGES.INTERNAL);
    expect(coreErrorMessage("NOT_FOUND", night)).toBe(CORE_ERROR_MESSAGES.NOT_FOUND);
  });
});
