// 送る前に整える：上限に合わせる（章とコメントは切る・長すぎる文は入れない）・ファイルの中の重なりを1つにする。
import { describe, expect, it } from "vitest";
import { fitMarkersToLimits, mergeDuplicateMarkers } from "./prepare-markers.ts";

describe("送る前に整える", () => {
  it("章は200字・コメントは4,000字で切り、4,000字をこえる文は入れない", () => {
    const result = fitMarkersToLimits([
      {
        text: "ふつう",
        chapter: "章".repeat(201),
        comment: "📚".repeat(4001),
        position: 1,
        question: false,
      },
      { text: "あ".repeat(4001), position: 2, question: false },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.markers).toHaveLength(1);
    expect([...(result.markers[0]?.chapter ?? "")]).toHaveLength(200);
    expect([...(result.markers[0]?.comment ?? "")]).toHaveLength(4000);
  });

  it("同じ鍵のものは1つにし、コメントをつなぎ、印はどちらかにあれば立てる", async () => {
    const merged = await mergeDuplicateMarkers([
      { text: "同じ 文", page: 3, comment: "前", position: 1, question: false },
      { text: "ちがう文", page: 3, position: 2, question: false },
      { text: "同じ\n文", page: 3, comment: "? 後", chapter: "3章", position: 3, question: true },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      text: "同じ 文",
      comment: "前\n? 後",
      chapter: "3章",
      question: true,
    });
  });
});
