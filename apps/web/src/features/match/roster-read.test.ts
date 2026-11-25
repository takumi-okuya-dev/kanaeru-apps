// フォームの回答から名簿を読む：氏名・レベル・タイムスタンプだけを読む・同じ氏名は新しいほう・ほかの列は読まない・
// レベルの読み方・呼び名（姓・同じ姓は名の字を足す・空白がなければ印・名まで同じなら数字・すでにある呼び名と重ねない）。
// 名前はどれも架空のもの。
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../lib/csv-read.ts";
import { assignNicknames, readLevel, readRoster } from "./roster-read.ts";

/** スプレッドシートから貼った見本（タブ区切り。メール・ラケット・きっかけ・要望の列つき）。 */
const PASTED = [
  "タイムスタンプ\tメールアドレス\t氏名\tバドミントンのレベル\tラケットの有無\tキッカケの友人\tその他の要望",
  "2026/11/01 10:00:00\ta@example.com\t高橋 拓真\t1上級\tあり\t\t",
  "2026/11/01 11:00:00\tb@example.com\t佐藤 美咲\t2中級\tあり\t高橋\t遅れます",
  "2026/11/02 09:00:00\tc@example.com\t林優斗\t3初級\tなし\t\t",
  "2026/11/03 08:00:00\td@example.com\t高橋 拓真\t2中級\tあり\t\t",
  "2026/11/03 09:00:00\te@example.com\t\t4入門\tあり\t\t",
].join("\n");

describe("名簿を読む", () => {
  it("氏名とレベルを読み、同じ氏名はタイムスタンプの新しいほうを使う。ほかの列は持たない", () => {
    const result = readRoster(parseCsv(PASTED, { delimiter: "auto" }));
    expect(result.people).toEqual([
      { fullName: "高橋 拓真", level: "intermediate" },
      { fullName: "佐藤 美咲", level: "intermediate" },
      { fullName: "林優斗", level: "beginner" },
    ]);
    expect(result.columns).toEqual({
      name: "氏名",
      level: "バドミントンのレベル",
      timestamp: "タイムスタンプ",
    });
    expect(result.replaced).toBe(1);
    expect(result.skipped).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/example\.com|遅れます|ラケット.*あり/u);
  });

  it("古い回答が下の行にあっても、新しいタイムスタンプのほうを残す", () => {
    const text = [
      "タイムスタンプ,お名前,レベル",
      "2026/11/05 10:00:00,山田 花子,1上級",
      "2026/11/01 10:00:00,山田　花子,4入門",
    ].join("\n");
    expect(readRoster(parseCsv(text)).people).toEqual([
      { fullName: "山田 花子", level: "advanced" },
    ]);
  });

  it("レベルの列がない表も読める（レベルは名簿で入れる）", () => {
    const result = readRoster(parseCsv("氏名\n鈴木 一郎\n", { delimiter: "auto" }));
    expect(result.people).toEqual([{ fullName: "鈴木 一郎", level: null }]);
    expect(result.columns.level).toBeNull();
  });

  it("レベルは先頭の数字（全角も）か言葉で読む", () => {
    expect(readLevel("1上級")).toBe("advanced");
    expect(readLevel("２中級")).toBe("intermediate");
    expect(readLevel("初級です")).toBe("beginner");
    expect(readLevel("4")).toBe("novice");
    expect(readLevel("5")).toBeNull();
    expect(readLevel("")).toBeNull();
  });
});

describe("呼び名", () => {
  it("姓を呼び名にし、同じ姓は名の1字を足し、空白がなければ頭の2字にして印を付ける", () => {
    const named = assignNicknames([
      { fullName: "高橋 拓真", level: "advanced" },
      { fullName: "佐藤 美咲", level: "advanced" },
      { fullName: "佐藤 健司", level: "advanced" },
      { fullName: "林優斗", level: "beginner" },
    ]);
    expect(named.map((person) => [person.nickname, person.nameCheck])).toEqual([
      ["高橋", false],
      ["佐藤美", false],
      ["佐藤健", false],
      ["林優", true],
    ]);
  });

  it("名の1字まで同じなら見分けられるまで字を足し、名まで同じなら数字を足す", () => {
    const named = assignNicknames([
      { fullName: "伊藤 結衣", level: null },
      { fullName: "伊藤 結菜", level: null },
      { fullName: "渡辺 颯太", level: null },
      { fullName: "渡辺 颯太", level: null },
    ]);
    expect(named.map((person) => person.nickname)).toEqual([
      "伊藤結衣",
      "伊藤結菜",
      "渡辺颯太",
      "渡辺颯太2",
    ]);
  });

  it("すでに名簿にある呼び名とは重ねない（同じ姓として名の字を足す）", () => {
    const named = assignNicknames([{ fullName: "高橋 海", level: null }], ["高橋"]);
    expect(named[0]?.nickname).toBe("高橋海");
  });
});
