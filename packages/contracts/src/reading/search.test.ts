// 探すときのそろえ方と当たった所：全角と半角・大文字と小文字・ひらがなとカタカナ・絵文字で位置がずれない・LIKE の逃がし。
import { describe, expect, it } from "vitest";
import { escapeLike, findMatches, normalizeForSearch } from "./index.ts";

/**
 * 当たった所の文字。
 * @param original もとの文
 * @param query 言葉
 * @returns 当たった文字の並び
 */
function hits(original: string, query: string): string[] {
  return findMatches(original, query).map(({ start, end }) => original.slice(start, end));
}

describe("探すときのそろえ方", () => {
  it("NFKC・カタカナをひらがなに・小文字", () => {
    expect(normalizeForSearch("ＧＯ タナカ")).toBe("go たなか");
  });

  it("全角・カタカナ・大文字の違いで当たり、もとの文の位置で返す", () => {
    expect(hits("Ｇｏ のバックエンドと GO", "go")).toEqual(["Ｇｏ", "GO"]);
    expect(hits("ケッテイの決め方", "けってい")).toEqual(["ケッテイ"]);
  });

  it("絵文字の後ろでも位置がずれない", () => {
    expect(hits("📚本の決め方", "決め方")).toEqual(["決め方"]);
  });

  it("空の言葉は当たらない", () => {
    expect(findMatches("文", "  ")).toEqual([]);
  });

  it("LIKE の印を逃がす", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});
