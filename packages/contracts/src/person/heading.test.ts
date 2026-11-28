// 人物メモの書き足しの見出し：書き足した日（日本時間）と、選んだ会った場の名前と日付（research R8）。
import { describe, expect, it } from "vitest";
import { appendHeading, appendTalk } from "./index.ts";

describe("書き足しの見出し", () => {
  it("見出しは書き足した日。会った場を選んだら、その名前と日付も入る", () => {
    const now = new Date("2026-12-03T03:00:00Z");
    expect(appendHeading(now)).toBe("── 2026-12-03 ──");
    expect(appendHeading(now, { name: "12月の勉強会", metOn: "2026-12-03" })).toBe(
      "── 2026-12-03 12月の勉強会（2026-12-03）──",
    );
  });

  it("日付は日本時間（UTC の15時は次の日）", () => {
    expect(appendHeading(new Date("2026-12-02T14:59:59Z"))).toBe("── 2026-12-02 ──");
    expect(appendHeading(new Date("2026-12-02T15:00:00Z"))).toBe("── 2026-12-03 ──");
  });

  it("前の文のあとに、空の行・見出し・書き足した文を続ける", () => {
    const now = new Date("2026-12-03T03:00:00Z");
    expect(appendTalk("Go の話", "転職の話", now)).toBe("Go の話\n\n── 2026-12-03 ──\n転職の話");
  });

  it("話したことが空なら見出しから始める", () => {
    const now = new Date("2026-12-03T03:00:00Z");
    expect(appendTalk("", "転職の話", now)).toBe("── 2026-12-03 ──\n転職の話");
    expect(appendTalk(" \n", "転職の話", now)).toBe("── 2026-12-03 ──\n転職の話");
  });
});
