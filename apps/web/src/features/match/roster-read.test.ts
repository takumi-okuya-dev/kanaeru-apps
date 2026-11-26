// フォームの回答から名簿を読む：氏名・レベル・タイムスタンプだけを読む・同じ氏名は新しいほう・ほかの列は読まない・
// レベルの読み方・呼び名（姓・同じ姓は名の字を足す・空白がなければ印・名まで同じなら数字・すでにある呼び名と重ねない）。
// 名前はどれも架空のもの。
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../lib/csv-read.ts";
import { assignNicknames, detectColumns, levelChoices, readLevel, readRoster, timestampKey } from "./roster-read.ts";

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

  it("レベルは言葉を数字より先に読み、言葉がなければ先頭の数字（全角も）で読む", () => {
    expect(readLevel("1入門")).toBe("novice");
    expect(readLevel("4上級")).toBe("advanced");
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

describe("列の確かめ（match-008）", () => {
  /** 氏名の質問の名前を変えたフォーム（Google フォームの CSV の形。メール・要望の列つき）。 */
  const RENAMED = [
    "タイムスタンプ,メールアドレス,参加者,あなたの実力,その他の要望",
    "2026/11/20 9:12:45,a@example.com,山田 太郎,ラリーが続く（中級）,",
    "2026/11/20 12:30:02,b@example.com,佐藤 花子,初めて（入門）,よろしく",
  ].join("\n");

  it("氏名の列が見つからなければ、1列目（タイムスタンプ）を使わず、人を入れない（SC-001）", () => {
    const parsed = parseCsv(RENAMED);
    const detected = detectColumns(parsed);
    expect(detected.name).toBe(-1);
    const result = readRoster(parsed);
    expect(result.people).toEqual([]);
    expect(result.columns.name).toBeNull();
  });

  it("氏名の列を選べば読める。レベルは見出しがなくても選択肢の言葉で推しはかる。ほかの列は持たない", () => {
    const parsed = parseCsv(RENAMED);
    const detected = detectColumns(parsed);
    expect(detected.level).toBe(3);
    expect(detected.timestamp).toBe(0);
    const result = readRoster(parsed, { ...detected, name: 2 });
    expect(result.people).toEqual([
      { fullName: "山田 太郎", level: "intermediate" },
      { fullName: "佐藤 花子", level: "novice" },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/example\.com|よろしく/u);
  });

  it("列が1つだけの表は、見出しが何でもその列を氏名とみなす", () => {
    expect(detectColumns(parseCsv("参加者\n鈴木 一郎\n")).name).toBe(0);
  });

  it("選択肢を逆に振っても、言葉どおりに読む。読めない選択肢は対応で選ぶ（SC-002）", () => {
    const parsed = parseCsv(["氏名,レベル", "山田 太郎,1入門", "佐藤 花子,4上級", "林 優斗,A：大会に出ている"].join("\n"));
    const { choices } = levelChoices(parsed, 1);
    expect(choices).toEqual([
      { value: "1入門", level: "novice" },
      { value: "4上級", level: "advanced" },
      { value: "A：大会に出ている", level: undefined },
    ]);
    const map = new Map([
      ["1入門", "novice" as const],
      ["4上級", "advanced" as const],
      ["A：大会に出ている", "advanced" as const],
    ]);
    expect(readRoster(parsed, detectColumns(parsed), map).people.map((person) => person.level)).toEqual([
      "novice",
      "advanced",
      "advanced",
    ]);
  });

  it("午前・午後の付いた日時も 24 時間に直して比べ、新しい回答を使う（SC-003）", () => {
    expect(timestampKey("2026/11/21 1:05:18 午後 GMT+9") > timestampKey("2026/11/21 11:00:00 午前 GMT+9")).toBe(true);
    expect(timestampKey("2026/11/21 12:10:00 午前") < timestampKey("2026/11/21 1:00:00 午前")).toBe(true);
    expect(timestampKey("11/21/2026 1:05:18 PM")).not.toBe("");
    const text = [
      "タイムスタンプ,氏名,レベル",
      "2026/11/21 1:05:18 午後 GMT+9,山田 太郎,1上級",
      "2026/11/21 11:00:00 午前 GMT+9,山田 太郎,4入門",
    ].join("\n");
    expect(readRoster(parseCsv(text)).people).toEqual([{ fullName: "山田 太郎", level: "advanced" }]);
  });
});
