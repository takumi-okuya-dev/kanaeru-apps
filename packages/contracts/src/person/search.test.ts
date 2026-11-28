// 人物メモの検索のそろえ方：ひらがなとカタカナ・全角と半角・大文字と小文字をそろえる・当たった位置をもとの文で返す・
// LIKE の記号を逃がす・会った場の名前とタグのそろえ方（research R6）。
import { describe, expect, it } from "vitest";
import {
  SEARCH_VERSION,
  escapeLike,
  findMatches,
  normalizeForSearch,
  normalizeMeetingName,
  normalizeTag,
} from "./index.ts";

/**
 * 当たった所の文を、もとの文から切り出す。
 * @param original もとの文
 * @param query 探す言葉
 * @returns 当たった所の文の並び
 */
function hits(original: string, query: string): string[] {
  return findMatches(original, query).map((match) => original.slice(match.start, match.end));
}

describe("検索のそろえ方", () => {
  it("NFKC → カタカナをひらがなに → 小文字", () => {
    expect(normalizeForSearch("タナカ")).toBe("たなか");
    expect(normalizeForSearch("ﾀﾅｶ")).toBe("たなか");
    expect(normalizeForSearch("Ｇｏ")).toBe("go");
    expect(normalizeForSearch("ガギ")).toBe("がぎ");
    expect(normalizeForSearch("ｶﾞｷﾞ")).toBe("がぎ");
    expect(normalizeForSearch("ヴ")).toBe("ゔ");
    expect(normalizeForSearch("ラーメン")).toBe("らーめん");
    expect(normalizeForSearch("たろう🍙")).toBe("たろう🍙");
  });

  it("そろえ方の版は 1", () => {
    expect(SEARCH_VERSION).toBe(1);
  });
});

describe("当たった位置", () => {
  it("全角の「Ｇｏ」を「go」で探すと、もとの文の「Ｇｏ」の所を返す", () => {
    expect(hits("話題：Ｇｏ のバックエンド", "go")).toEqual(["Ｇｏ"]);
    expect(hits("Go のバックエンドと go の話", "ｇｏ")).toEqual(["Go", "go"]);
  });

  it("「タナカ」で「たなか」と「ﾀﾅｶ」に当たる", () => {
    expect(hits("よみ：たなか", "タナカ")).toEqual(["たなか"]);
    expect(hits("ﾀﾅｶさん", "たなか")).toEqual(["ﾀﾅｶ"]);
  });

  it("絵文字・結合文字・半角の濁点があっても位置がずれない", () => {
    expect(hits("🍙たろう🍙と👨‍👩‍👧の話", "たろう")).toEqual(["たろう"]);
    expect(hits("👨‍👩‍👧の話", "の話")).toEqual(["の話"]);
    expect(hits("か\u3099っこう", "がっこう")).toEqual(["か\u3099っこう"]);
    expect(hits("ｶﾞｯｺｳの話", "がっこう")).toEqual(["ｶﾞｯｺｳ"]);
  });

  it("当たらなければ空・空の言葉も空", () => {
    expect(findMatches("田中 太郎", "鈴木")).toEqual([]);
    expect(findMatches("田中 太郎", "")).toEqual([]);
  });

  it("重ならないように、前から順に返す", () => {
    expect(findMatches("ああああ", "ああ")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe("LIKE の記号を逃がす", () => {
  it("% と _ と \\ の前に \\ を足す", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\x")).toBe("c:\\\\x");
    expect(escapeLike("ふつう")).toBe("ふつう");
  });
});

describe("会った場の名前とタグのそろえ方", () => {
  it("前後の空白を除き、間の空白を1つにしてからそろえる", () => {
    const key = normalizeMeetingName("11月の AI 勉強会");
    expect(normalizeMeetingName("  11月の　ＡＩ   勉強会 ")).toBe(key);
    expect(normalizeMeetingName("11月の ai 勉強会")).toBe(key);
    expect(key).toBe("11月の ai 勉強会");
  });

  it("タグは「AI」「ai」「ＡＩ」を同じものにする", () => {
    expect(normalizeTag("AI")).toBe("ai");
    expect(normalizeTag(" ＡＩ ")).toBe("ai");
    expect(normalizeTag("ai")).toBe("ai");
  });
});
