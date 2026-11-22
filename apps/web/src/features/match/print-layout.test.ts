// 印刷の版の大きさ：行が表の高さをちょうど埋める・試合が少ないほど字が大きい・長い呼び名でも列に収まる・小さすぎると印・
// 紙の大きさと向き。
import { describe, expect, it } from "vitest";
import {
  ORIENTATIONS,
  PAPER_SIZES,
  layoutSheet,
  printableArea,
  textWidthEm,
} from "./print-layout.ts";

describe("印刷の版の大きさ", () => {
  it("どの紙と向きでも、題・表・下の文字が刷る範囲にちょうど収まる", () => {
    for (const size of PAPER_SIZES) {
      for (const orientation of ORIENTATIONS) {
        const layout = layoutSheet({ size, orientation, rows: 8, columns: 4, longestNameEm: 3 });
        const bottom = layout.tableTop + layout.rowHeight * 8 + layout.footerSize * 2;
        expect(bottom).toBeCloseTo(layout.height, 6);
        expect(layout.numberWidth + layout.nameWidth * 4).toBeCloseTo(layout.width, 6);
      }
    }
  });

  it("試合が少ないと字が大きく、多いと小さい。長い呼び名でも列の幅に収まる", () => {
    const few = layoutSheet({
      size: "a3",
      orientation: "portrait",
      rows: 8,
      columns: 4,
      longestNameEm: 3,
    });
    const many = layoutSheet({
      size: "a3",
      orientation: "portrait",
      rows: 40,
      columns: 4,
      longestNameEm: 3,
    });
    expect(few.fontSize).toBeGreaterThan(many.fontSize);
    const long = layoutSheet({
      size: "a3",
      orientation: "portrait",
      rows: 8,
      columns: 4,
      longestNameEm: 10,
    });
    expect(long.fontSize * 10).toBeLessThanOrEqual(long.nameWidth);
  });

  it("小さい紙に試合が多いと「読みにくい」の印が付く", () => {
    expect(
      layoutSheet({ size: "a5", orientation: "portrait", rows: 60, columns: 4, longestNameEm: 4 })
        .tooSmall,
    ).toBe(true);
    expect(
      layoutSheet({ size: "a3", orientation: "portrait", rows: 8, columns: 4, longestNameEm: 3 })
        .tooSmall,
    ).toBe(false);
  });

  it("横の向きは幅と高さが入れかわり、全角と半角の幅を見積もる", () => {
    const portrait = printableArea("a4", "portrait");
    const landscape = printableArea("a4", "landscape");
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(textWidthEm("高橋")).toBe(2);
    expect(textWidthEm("Ken")).toBeCloseTo(1.8);
  });
});
