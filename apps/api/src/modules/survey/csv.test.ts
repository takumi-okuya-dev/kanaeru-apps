// 困りごとの CSV：BOM・CRLF・見出し・選択肢の言葉・空欄・囲み・式の差しこみの打ち消し・日本時間。
import { describe, expect, it } from "vitest";
import type { CheckinRecord } from "../reception/index.ts";
import { jstDateTime } from "@workspace/contracts/core";
import { csvCell } from "@workspace/csv";
import { buildConcernsCsv } from "./csv.ts";
import type { SurveyAnswerRecord } from "./repository.ts";

/** チェックインの見本。 */
const CHECKIN: CheckinRecord = {
  id: "0193a1b2-0000-7000-8000-000000000001",
  eventId: "0193a1b2-0000-7000-8000-000000000002",
  accountId: "0193a1b2-0000-7000-8000-000000000003",
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
  createdAt: new Date("2026-11-25T10:00:00Z"),
  updatedAt: new Date("2026-11-25T10:00:00Z"),
};

/** 回答の見本。 */
const ANSWER: SurveyAnswerRecord = {
  id: "0193a1b2-0000-7000-8000-000000000004",
  checkinId: CHECKIN.id,
  concern: "部下にAIを\n使わせたい",
  monthlyPrice: "jpy1000",
  tester: "yes",
  jobRole: "manager",
  jobType: null,
  createdAt: new Date("2026-11-25T12:00:00Z"),
  updatedAt: new Date("2026-11-25T12:30:00Z"),
};

describe("困りごとの CSV", () => {
  it("BOM と見出しで始まり、選択肢は言葉・null は空欄・改行は囲み、CRLF で終わる", () => {
    const csv = buildConcernsCsv([
      { answer: ANSWER, checkin: CHECKIN },
      {
        answer: { ...ANSWER, concern: null, monthlyPrice: null, tester: null, jobRole: null },
        checkin: { ...CHECKIN, accountId: null, name: "手の人" },
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const body = csv.slice(1);
    expect(body.split("\r\n")[0]).toBe(
      "名前,困りごと,月いくら,テスター,仕事の立場,職種,入れ方,回答の時刻",
    );
    expect(body).toContain(
      '佐藤 太郎,"部下にAIを\n使わせたい","1,000円",はい,管理職,,LINE,2026-11-25 21:30',
    );
    expect(body).toContain("手の人,,,,,,手,2026-11-25 21:30");
  });

  it('式として読まれる先頭を打ち消し、" を2つにして囲む', () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell('言う"こと"')).toBe('"言う""こと"""');
    expect(csvCell("ふつう")).toBe("ふつう");
  });

  it("日時は日本時間", () => {
    expect(jstDateTime(new Date("2026-11-25T15:05:00Z"))).toBe("2026-11-26 00:05");
  });
});
