// CSV を画面の中で読む：文字コード（UTF-8・BOM・Shift_JIS）・囲み・囲みの中の改行・CRLF・見出しの空と重なり・貼った名前。
import { describe, expect, it } from "vitest";
import { decodeCsv, parseCsv, splitPastedNames } from "./csv-read.ts";

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
