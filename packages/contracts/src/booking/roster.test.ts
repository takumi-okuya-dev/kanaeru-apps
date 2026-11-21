// 予約の約束：入力の形と誤りの文・上限・選べる使い方・道。
import { describe, expect, it } from "vitest";
import {
  BOOKING_ROUTE_PATTERNS,
  BookingSettingInput,
  IMPORT_HEADERS_MAX,
  IMPORT_HEADER_MAX,
  ROSTER_IMPORT_ROWS_MAX,
  RosterEntryInput,
  RosterImportInput,
  bookingPaths,
  importMappingFits,
} from "./index.ts";

/**
 * 誤りを、欄の道と文の組にする。
 * @param result safeParse の結果
 * @param result.error 誤り
 * @returns 欄の道と文の並び
 */
function issuesOf(result: {
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): [string, string][] {
  return (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]);
}

describe("予約の約束", () => {
  it("使い方は受付だけ・名簿を使う・自前で申込みを受けるを選べる（booking-003）", () => {
    expect(BookingSettingInput.safeParse({ mode: "roster" }).success).toBe(true);
    expect(BookingSettingInput.safeParse({ mode: "reception" }).success).toBe(true);
    expect(BookingSettingInput.safeParse({ mode: "self_page" }).success).toBe(true);
    expect(issuesOf(BookingSettingInput.safeParse({ mode: "waitlist" }))).toEqual([
      ["mode", "使い方を選んでください。"],
    ]);
  });

  it("1人足す：名前は前後の空白を消し、空と51文字は誤り。メモは任意", () => {
    expect(RosterEntryInput.parse({ name: " 山田 花子 ", applicationSource: "peatix" })).toEqual({
      name: "山田 花子",
      applicationSource: "peatix",
    });
    expect(issuesOf(RosterEntryInput.safeParse({ name: " ", applicationSource: "x" }))).toEqual([
      ["name", "名前を入れてください。"],
      ["applicationSource", "申し込みの媒体を選んでください。"],
    ]);
    expect(
      issuesOf(RosterEntryInput.safeParse({ name: "あ".repeat(51), applicationSource: "other" })),
    ).toEqual([["name", "名前は50文字までにしてください。"]]);
  });

  it("取り込み：空の名前は通し（名前が空になる）、行の数と名前の列を確かめる", () => {
    const rows = [{ line: 2, name: "" }];
    expect(RosterImportInput.safeParse({ applicationSource: "other", rows }).success).toBe(true);
    const tooMany = Array.from({ length: ROSTER_IMPORT_ROWS_MAX + 1 }, (_, index) => ({
      line: index + 2,
      name: "名前",
    }));
    expect(
      issuesOf(RosterImportInput.safeParse({ applicationSource: "other", rows: tooMany })),
    ).toEqual([["rows", "一度に取り込めるのは500行までです。ファイルを分けてください。"]]);
    expect(
      issuesOf(
        RosterImportInput.safeParse({
          applicationSource: "other",
          rows,
          mapping: { headers: ["お名前"], nameColumn: "氏名" },
        }),
      ),
    ).toEqual([["mapping.nameColumn", "名前の列が、見出しの中にありません。"]]);
  });

  it("列の対応を覚えられるのは、列の数と見出しの長さが上限の中で、名前の列が見出しにあるときだけ", () => {
    expect(importMappingFits(["タイムスタンプ", "お名前"], "お名前")).toBe(true);
    expect(importMappingFits(["タイムスタンプ", "お名前"], "氏名")).toBe(false);
    const many = Array.from({ length: IMPORT_HEADERS_MAX + 1 }, (_, index) => `列${index}`);
    expect(importMappingFits(many, "列0")).toBe(false);
    const long = "あ".repeat(IMPORT_HEADER_MAX + 1);
    expect(importMappingFits(["お名前", long], "お名前")).toBe(false);
    // 上限ちょうどは覚えられ、約束の形も通る
    const edge = Array.from({ length: IMPORT_HEADERS_MAX }, (_, index) =>
      `${index}`.padEnd(IMPORT_HEADER_MAX, "x"),
    );
    expect(importMappingFits(edge, edge[0] ?? "")).toBe(true);
    expect(
      RosterImportInput.safeParse({
        applicationSource: "other",
        rows: [{ line: 2, name: "山田 花子" }],
        mapping: { headers: edge, nameColumn: edge[0] },
      }).success,
    ).toBe(true);
  });

  it("道の形と、値を入れた道がそろう", () => {
    expect(bookingPaths.roster("e1")).toBe(BOOKING_ROUTE_PATTERNS.roster.replace("$eventId", "e1"));
    expect(bookingPaths.rosterImport("e1")).toBe("/admin/events/e1/roster/import");
    expect(bookingPaths.rosterMatch("e1")).toBe("/admin/events/e1/roster/match");
    expect(() => bookingPaths.roster("")).toThrow(RangeError);
  });
});
