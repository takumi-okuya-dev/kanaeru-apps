// マーカーの重なりを見分ける鍵：そろえ方と、同じ・違うの見分け。
import { describe, expect, it } from "vitest";
import { markerKey, markerKeySource, normalizeMarkerText } from "./index.ts";

describe("マーカーの鍵", () => {
  it("空白と改行の違い・全角の空白・前後の空白はそろえる", () => {
    expect(normalizeMarkerText("  Pod には\n1つずつ　IP が付く ")).toBe(
      "Pod には 1つずつ IP が付く",
    );
    expect(normalizeMarkerText("見本の\nマーカーの 文")).toBe("見本のマーカーの文");
    expect(normalizeMarkerText("Service and\nIngress")).toBe("Service and Ingress");
    expect(normalizeMarkerText("ＡＢＣ１２３")).toBe("ABC123");
  });

  it("空白と改行の違いだけなら同じ鍵、ページが違えば別の鍵", async () => {
    const a = await markerKey({ text: "Pod には\n1つずつ IP", page: 38 });
    const b = await markerKey({ text: "Pod には 1つずつ  IP", page: 38 });
    const c = await markerKey({ text: "Pod には 1つずつ IP", page: 39 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("文のないものはコメントで見分ける", async () => {
    expect(markerKeySource({ text: "", comment: " あとで見る ", page: 7 })).toBe(
      "comment:あとで見る|7|",
    );
    const a = await markerKey({ text: "", comment: "あとで見る", page: 7 });
    const b = await markerKey({ text: "", comment: "べつのこと", page: 7 });
    expect(a).not.toBe(b);
  });

  it("文があるときはコメントが違っても同じ鍵（取りこみ直しでコメントだけ新しくする）", async () => {
    const a = await markerKey({ text: "同じ文", comment: "前のコメント", page: 1 });
    const b = await markerKey({ text: "同じ文", comment: "直したコメント", page: 1 });
    expect(a).toBe(b);
  });
});
