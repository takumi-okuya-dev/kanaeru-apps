// CSV を画面の中で読む：文字コード（UTF-8・BOM・Shift_JIS）・囲み・囲みの中の改行・CRLF・見出しの空と重なり・貼った名前。
// スプレッドシートから貼った表（タブ区切り）と、区切りの決め方（core-014）。
import { describe, expect, it } from "vitest";
import { decodeCsv, detectDelimiter, parseCsv, splitPastedNames } from "./csv-read.ts";

describe("CSV を読む", () => {
  it("UTF-8 の BOM を外して読む", () => {
    const bytes = new TextEncoder().encode("\uFEFFお名前\n山田 花子\n");
    expect(decodeCsv(bytes.buffer)).toBe("お名前\n山田 花子\n");
  });

  it("UTF-8 で読めなければ Shift_JIS として読む", () => {
    // 「名前」の Shift_JIS（96BC 914F）
    const bytes = new Uint8Array([0x96, 0xbc, 0x91, 0x4f]);
    expect(decodeCsv(bytes.buffer)).toBe("名前");
  });

  it('囲み・""・囲みの中の改行・CRLF を読み、空の行は飛ばす。行の番号はファイルの行', () => {
    const text =
      'タイムスタンプ,お名前,ひとこと\r\n2026/11/01,"山田, 花子","よろしく\r\nお願いします"\r\n\r\n2026/11/02,鈴木 一郎,"""楽しみ"""\r\n';
    const parsed = parseCsv(text);
    expect(parsed.headers).toEqual(["タイムスタンプ", "お名前", "ひとこと"]);
    expect(parsed.rows).toEqual([
      { line: 2, cells: ["2026/11/01", "山田, 花子", "よろしく\r\nお願いします"] },
      { line: 5, cells: ["2026/11/02", "鈴木 一郎", '"楽しみ"'] },
    ]);
  });

  it("空の見出しと重なった見出しは、列の番号で見分ける", () => {
    expect(parseCsv("名前,,名前\na,b,c").headers).toEqual(["名前", "（2列目）", "名前（3列目）"]);
  });

  it("中身がなければ、見出しも行も空", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("貼った名前は1行に1人。前後の空白を消し、最後の空の行は数えない", () => {
    expect(splitPastedNames(" 山田 花子 \n\n鈴木 一郎\n\n")).toEqual([
      { line: 1, name: "山田 花子" },
      { line: 2, name: "" },
      { line: 3, name: "鈴木 一郎" },
    ]);
  });
});

describe("スプレッドシートから貼った表（タブ区切り）を読む", () => {
  it('Google スプレッドシートからコピーした表：タブで切り、カンマは欄の中のまま。改行と " を含む欄は囲みで読む', () => {
    const text =
      'タイムスタンプ\tお名前\tレベル\tひとこと\n2026/11/01 10:00:00\t山田, 花子\t中級\t"よろしく\nお願いします"\n2026/11/02 9:30:00\t鈴木 一郎\t初級\t"""楽しみ""です"';
    const parsed = parseCsv(text, { delimiter: "auto" });
    expect(parsed.headers).toEqual(["タイムスタンプ", "お名前", "レベル", "ひとこと"]);
    expect(parsed.rows).toEqual([
      { line: 2, cells: ["2026/11/01 10:00:00", "山田, 花子", "中級", "よろしく\nお願いします"] },
      { line: 4, cells: ["2026/11/02 9:30:00", "鈴木 一郎", "初級", '"楽しみ"です'] },
    ]);
  });

  it("Excel からコピーした表（CRLF・最後の改行あり）と、囲みの中のタブも読む", () => {
    const text = 'お名前\tメモ\r\n佐藤 次郎\t"左\t右"\r\n\r\n高橋 三郎\t\r\n';
    expect(parseCsv(text, { delimiter: "auto" })).toEqual({
      headers: ["お名前", "メモ"],
      rows: [
        { line: 2, cells: ["佐藤 次郎", "左\t右"] },
        { line: 4, cells: ["高橋 三郎", ""] },
      ],
    });
  });

  it('囲みは欄の頭の " だけ。欄の途中の " はそのまま残す（スプレッドシートは改行のない欄を囲まないことがある）', () => {
    expect(parseCsv('お名前\tひとこと\n田中\t"A"チーム希望', { delimiter: "auto" }).rows).toEqual([
      { line: 2, cells: ["田中", "Aチーム希望"] },
    ]);
    expect(parseCsv('お名前\tひとこと\n田中\t右の"A"チーム', { delimiter: "auto" }).rows).toEqual([
      { line: 2, cells: ["田中", '右の"A"チーム'] },
    ]);
  });

  it("区切りを決めないときは、今までどおりカンマで読む（booking のファイルの取り込みは変わらない）", () => {
    expect(parseCsv("お名前\tレベル\n山田\t中級").headers).toEqual(["お名前\tレベル"]);
  });
});

describe("区切りを決める", () => {
  it("1行目の囲みの外にタブがあればタブ、なければカンマ", () => {
    expect(detectDelimiter("お名前\tレベル\n山田, 花子\t中級")).toBe("\t");
    expect(detectDelimiter("お名前,レベル\n山田\t花子,中級")).toBe(",");
    expect(detectDelimiter("お名前（例：山田, 花子）\tレベル")).toBe("\t");
  });

  it("囲みの中のタブ・カンマ・改行は数えない", () => {
    expect(detectDelimiter('"お名前\tふりがな",レベル')).toBe(",");
    expect(detectDelimiter('"お名前,ふりがな"\tレベル')).toBe("\t");
    expect(detectDelimiter('"お名前\nふりがな",レベル\n山田\t花子,中級')).toBe(",");
  });

  it('欄の途中の " は囲みの始まりと見ない', () => {
    expect(detectDelimiter('お名前の"例",レベル')).toBe(",");
    expect(detectDelimiter('お名前の"例\tレベル')).toBe("\t");
  });

  it("先頭の空の行は飛ばして、最初の空でない行で決める", () => {
    expect(detectDelimiter("\r\n\nお名前\tレベル")).toBe("\t");
    expect(detectDelimiter("\n\nお名前,レベル")).toBe(",");
  });

  it("1列だけ（タブもカンマもない）ならタブ：貼った名前のカンマで欄を切らない", () => {
    expect(detectDelimiter("お名前\n山田, 花子")).toBe("\t");
    expect(parseCsv('お名前\n山田, 花子\n"鈴木, 一郎"', { delimiter: "auto" }).rows).toEqual([
      { line: 2, cells: ["山田, 花子"] },
      { line: 3, cells: ["鈴木, 一郎"] },
    ]);
  });

  it("CSV のファイルを auto で読んでも、カンマで読んだときと同じ", () => {
    const text = 'タイムスタンプ,お名前\r\n2026/11/01,"山田, 花子"\r\n2026/11/02,鈴木\t一郎\r\n';
    expect(parseCsv(text, { delimiter: "auto" })).toEqual(parseCsv(text));
  });

  it("中身がなければカンマでもタブでも空", () => {
    expect(detectDelimiter("")).toBe("\t");
    expect(parseCsv("", { delimiter: "auto" })).toEqual({ headers: [], rows: [] });
  });
});
