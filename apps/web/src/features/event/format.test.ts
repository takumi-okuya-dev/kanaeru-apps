// 交流会の日時と参加費の見せ方・入力の欄：いつも日本時間で、端末の時刻帯に頼らない。
import { describe, expect, it } from "vitest";
import {
  formatEventDateTime,
  formatFee,
  formatJstDate,
  fromJstInputs,
  parseFee,
  toJstInputs,
} from "./format.ts";

describe("交流会の日時と参加費", () => {
  it("日時は日本時間で、曜日つき", () => {
    expect(formatEventDateTime("2026-11-25T10:00:00.000Z")).toBe("2026年11月25日（水）19:00");
    // UTC では前の日でも、日本時間の日付で出す
    expect(formatJstDate("2026-11-24T15:30:00.000Z")).toBe("2026年11月25日（水）");
    expect(formatEventDateTime("2026-11-25T00:05:00+09:00")).toBe("2026年11月25日（水）00:05");
  });

  it("参加費は3桁ごとに区切り、円をつける", () => {
    expect(formatFee(1000)).toBe("1,000円");
    expect(formatFee(0)).toBe("0円");
  });

  it("日付と時刻の欄の値と、時差つきの ISO 8601 を行き来する", () => {
    expect(toJstInputs("2026-11-25T10:00:00.000Z")).toEqual({ date: "2026-11-25", time: "19:00" });
    expect(toJstInputs("2026-11-24T15:30:00.000Z")).toEqual({ date: "2026-11-25", time: "00:30" });
    expect(fromJstInputs("2026-11-25", "19:00")).toBe("2026-11-25T19:00:00+09:00");
    expect(fromJstInputs("2026-11-25", "19:00:30")).toBe("2026-11-25T19:00:00+09:00");
    expect(fromJstInputs("", "19:00")).toBeUndefined();
    expect(fromJstInputs("2026-11-25", "")).toBeUndefined();
  });

  it("参加費の欄は全角・区切りを読み、数字でなければ元の文字を返す", () => {
    expect(parseFee("1,000")).toBe(1000);
    expect(parseFee("１５００")).toBe(1500);
    expect(parseFee(" ")).toBeUndefined();
    expect(parseFee("-1")).toBe("-1");
    expect(parseFee("千円")).toBe("千円");
  });
});
