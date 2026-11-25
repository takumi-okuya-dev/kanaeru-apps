// CSV の道具（構成の決めごと AD-18。core-004 R1）の確かめ。
import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "./index.ts";

describe("csvCell", () => {
  it.each(["=1+1", "+81", "-1", "@SUM(A1)", "\tタブ", "\r改行"])(
    "式として読まれる先頭の文字（%j）に ' を足す",
    (value) => {
      expect(csvCell(value).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    },
  );

  it("全角の ＝ ＋ － ＠ で始まる欄と、前に空白・改行がある = にも ' を足す（表計算ソフトが式として読むことがあるため）", () => {
    for (const value of ["＝1+1", "＋1", "－1", "＠SUM(A1)", " =1+1", "\u3000=1+1", "\n=1+1"]) {
      expect(csvCell(value).replace(/^"/, ""), JSON.stringify(value)).toMatch(/^'/);
    }
    expect(csvCell("＝HYPERLINK(1)")).toBe("'＝HYPERLINK(1)");
  });

  it("全角でも式の文字でなければ、そのまま", () => {
    expect(csvCell("ＡＢＣ")).toBe("ＡＢＣ");
    expect(csvCell("　山田")).toBe("　山田");
  });

  it("途中の = は守らない", () => {
    expect(csvCell("a=1")).toBe("a=1");
  });

  it('" と , と改行を含む欄は " で囲み、中の " は "" にする', () => {
    expect(csvCell('彼は"はい"と言った')).toBe('"彼は""はい""と言った"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("1行目\n2行目")).toBe('"1行目\n2行目"');
    expect(csvCell("1行目\r\n2行目")).toBe('"1行目\r\n2行目"');
  });

  it("守りと囲みの両方が要るときは、' を足してから囲む", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("\r")).toBe('"\'\r"');
  });

  it("空の欄と、ふつうの文字はそのまま", () => {
    expect(csvCell("")).toBe("");
    expect(csvCell("山田 花子")).toBe("山田 花子");
  });
});

describe("buildCsv", () => {
  it("BOM で始め、行を CRLF で区切り、最後の行も CRLF で終える", () => {
    expect(
      buildCsv(
        ["名前", "金額"],
        [
          ["山田", "1000"],
          ["=1+1", "0"],
        ],
      ),
    ).toBe("\uFEFF名前,金額\r\n山田,1000\r\n'=1+1,0\r\n");
  });

  it("見出しも欄と同じ形にする（守りと囲み）", () => {
    expect(buildCsv(["-割引", "金額(円), 税込"], [])).toBe('\uFEFF\'-割引,"金額(円), 税込"\r\n');
  });

  it("行が0のときは見出しだけ", () => {
    expect(buildCsv(["名前"], [])).toBe("\uFEFF名前\r\n");
  });
});
