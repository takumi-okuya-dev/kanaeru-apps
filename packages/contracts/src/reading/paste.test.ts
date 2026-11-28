// 貼り付けの取りこみの読み方：ページ・コメント・あとで調べるの印・空の行・長すぎる行。
import { describe, expect, it } from "vitest";
import { READING_MARKER_LIMITS, isQuestionComment, parsePastedMarkers } from "./index.ts";

describe("貼り付けの読み方", () => {
  it("1行に1つ。空の行は飛ばす", () => {
    const { markers } = parsePastedMarkers("ひとつめ\n\n  ふたつめ  \r\nみっつめ");
    expect(markers.map((marker) => marker.text)).toEqual(["ひとつめ", "ふたつめ", "みっつめ"]);
    expect(markers.map((marker) => marker.position)).toEqual([1, 2, 3]);
  });

  it.each([
    ["p.38 Pod には IP が付く", 38],
    ["P38 Pod には IP が付く", 38],
    ["p38 Pod には IP が付く", 38],
    ["38: Pod には IP が付く", 38],
    ["38 Pod には IP が付く", 38],
  ])("%s はページ %i", (line, page) => {
    const [marker] = parsePastedMarkers(line).markers;
    expect(marker).toMatchObject({
      text: "Pod には IP が付く",
      page,
      position: page * 100_000 + 1,
    });
  });

  it("数字で始まる文でも、空白かコロンが続かなければページにしない", () => {
    const [marker] = parsePastedMarkers("3つの種類がある").markers;
    expect(marker).toMatchObject({ text: "3つの種類がある" });
    expect(marker?.page).toBeUndefined();
  });

  it("// の後ろはコメント。? か ？ で始まるコメントに印", () => {
    const { markers } = parsePastedMarkers(
      "文 // ふつうのコメント\n文2 // ? 分からない\n文3 //？ 調べる\n// コメントだけ",
    );
    expect(markers[0]).toMatchObject({ text: "文", comment: "ふつうのコメント", question: false });
    expect(markers[1]).toMatchObject({ comment: "? 分からない", question: true });
    expect(markers[2]).toMatchObject({ comment: "？ 調べる", question: true });
    expect(markers[3]).toMatchObject({ text: "", comment: "コメントだけ" });
    expect(isQuestionComment(undefined)).toBe(false);
  });

  it("上限をこえる行は読まず、行の番号を返す", () => {
    const long = "あ".repeat(READING_MARKER_LIMITS.text + 1);
    const result = parsePastedMarkers(`ふつう\n${long}\nふつう2`);
    expect(result.markers).toHaveLength(2);
    expect(result.tooLongLines).toEqual([2]);
  });
});
