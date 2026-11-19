// 参加者の CSV の形：BOM・CRLF・囲み・式の差しこみを打ち消す・日本時間。
import { describe, expect, it } from "vitest";
import { buildParticipantsCsv, csvCell, formatJstDateTime } from "./csv.ts";
import type { CheckinRecord } from "./repository.ts";

/**
 * 試しのチェックイン。
 * @param overrides 替える値
 * @returns チェックイン
 */
function record(overrides: Partial<CheckinRecord> = {}): CheckinRecord {
  return {
    id: "0193a1b2-0000-7000-8000-000000000001",
    eventId: "0193a1b2-0000-7000-8000-000000000000",
    accountId: "0193a1b2-0000-7000-8000-000000000002",
    enteredBy: null,
    name: "佐藤 太郎",
    applicationSource: "connpass",
    referral: "friend",
    paymentMethod: "paypay",
    amount: 1000,
    discountId: null,
    discountName: null,
    discountAmount: null,
    referrerName: null,
    createdAt: new Date("2026-11-25T10:03:00.000Z"),
    updatedAt: new Date("2026-11-25T10:03:00.000Z"),
    ...overrides,
  };
}

describe("参加者の CSV", () => {
  it("BOM と見出しで始まり、行は CRLF で区切り、選択肢は画面の言葉・時刻は日本時間", () => {
    const csv = buildParticipantsCsv([
      { record: record(), enteredByName: null },
      {
        record: record({ accountId: null, enteredBy: "x", paymentMethod: "free", amount: 0 }),
        enteredByName: "受付係",
      },
      {
        record: record({
          amount: 4000,
          discountId: "0193a1b2-0000-7000-8000-000000000009",
          discountName: "紹介割",
          discountAmount: 1000,
          referrerName: "=田中",
        }),
        enteredByName: null,
      },
    ]);
    expect(csv.startsWith("﻿名前,チェックインの時刻,")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "﻿名前,チェックインの時刻,申し込みの媒体,知ったきっかけ,支払い方法,金額,割引,割引の額,紹介者,入れ方,入れた人",
      "佐藤 太郎,2026-11-25 19:03,connpass,知人の紹介,PayPay,1000,,,,LINE,",
      "佐藤 太郎,2026-11-25 19:03,connpass,知人の紹介,無料（招待など）,0,,,,手,受付係",
      "佐藤 太郎,2026-11-25 19:03,connpass,知人の紹介,PayPay,4000,紹介割,1000,'=田中,LINE,",
      "",
    ]);
  });

  it("カンマ・引用符・改行を含む欄は囲み、式で始まる欄は ' を足す", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@a")).toBe("'@a");
    expect(csvCell("佐藤")).toBe("佐藤");
  });

  it("日本時間の日付の境をまたぐ", () => {
    expect(formatJstDateTime(new Date("2026-11-25T15:30:00.000Z"))).toBe("2026-11-26 00:30");
  });
});
