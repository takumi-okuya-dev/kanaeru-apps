// Kindle の書き出しの HTML の読み方：英語と日本語の見本で同じに読める・メモは直前のハイライトに付く・ページと位置・
// 「Highlight(」の空白の揺れ・「章名 >」・ページのない本・メモだけ・「…」で終わるもの・Kindle でない HTML・スクリプトを動かさない。
// 見本は架空の文（__fixtures__/KINDLE.md）。
import { describe, expect, it } from "vitest";
import kindleEn from "./__fixtures__/kindle-en.html?raw";
import kindleJa from "./__fixtures__/kindle-ja.html?raw";
import { KindleReadError, pageAndLocation, readKindleHtml } from "./kindle.ts";

/** 見本（ファイルの名前 → HTML）。 */
const FIXTURES: Record<string, string> = { "kindle-en.html": kindleEn, "kindle-ja.html": kindleJa };

/**
 * 見本を読む。
 * @param name ファイルの名前
 * @returns HTML
 */
function fixture(name: string): string {
  const html = FIXTURES[name];
  if (html === undefined) throw new Error("見本がありません。");
  return html;
}

describe("Kindle の書き出しの読み方", () => {
  it.each(["kindle-en.html", "kindle-ja.html"])("%s：章・ページ・位置・メモが取れる", (name) => {
    const result = readKindleHtml(fixture(name));
    expect(result.title).not.toBeNull();
    expect(result.author).not.toBeNull();
    expect(result.markers).toHaveLength(3);
    const [first, second, third] = result.markers;
    expect(first).toMatchObject({ page: 9, location: 55, question: true });
    expect(first?.comment).toMatch(/^\? /u);
    expect(first?.chapter).toMatch(/1/u);
    expect(second).toMatchObject({ page: 1203, location: 1820 });
    expect(second?.chapter).toMatch(/2/u);
    expect(third).toMatchObject({ location: 1900 });
    expect(third?.page).toBeUndefined();
    expect(result.markers.map((marker) => marker.position)).toEqual([
      9 * 100_000 + 55,
      1203 * 100_000 + 1820,
      1900,
    ]);
    expect(result.truncatedCount).toBe(1);
  });

  it("英語と日本語の見本で、数と並びが同じ", () => {
    const en = readKindleHtml(fixture("kindle-en.html")).markers;
    const ja = readKindleHtml(fixture("kindle-ja.html")).markers;
    expect(ja.map(({ page, location, position }) => ({ page, location, position }))).toEqual(
      en.map(({ page, location, position }) => ({ page, location, position })),
    );
  });

  it("直前にハイライトがないメモ・位置が離れたメモは、コメントだけのマーカーになる", () => {
    const html = `<div class="bookTitle">見本</div>
      <div class="noteHeading">Note - Location 10</div><div class="noteText">メモだけ</div>
      <div class="noteHeading">Highlight(<span class="highlight_pink">pink</span>) - Location 100</div><div class="noteText">文</div>
      <div class="noteHeading">Note - Location 500</div><div class="noteText">離れたメモ</div>`;
    const { markers } = readKindleHtml(html);
    expect(markers.map((marker) => [marker.text, marker.comment ?? null])).toEqual([
      ["", "メモだけ"],
      ["文", null],
      ["", "離れたメモ"],
    ]);
  });

  it("見出しのページと位置（言葉・カンマ・章名に左右されない）", () => {
    expect(pageAndLocation("Highlight(yellow) - Page 9 · Location 55")).toEqual({
      page: 9,
      location: 55,
    });
    expect(pageAndLocation("ハイライト(黄色) - 3章 見本 > ページ 1,203 · 位置No. 1,820")).toEqual({
      page: 1203,
      location: 1820,
    });
    expect(pageAndLocation("Note - Location 1,900")).toEqual({ location: 1900 });
    expect(pageAndLocation("Note")).toEqual({});
  });

  it("Kindle の書き出しでない HTML は KindleReadError", () => {
    expect(() => readKindleHtml("<html><body><p>ふつうのページ</p></body></html>")).toThrow(
      KindleReadError,
    );
  });

  it("スクリプトを動かさない", () => {
    readKindleHtml(fixture("kindle-en.html"));
    expect((globalThis as { __evil?: boolean }).__evil).toBeUndefined();
  });
});
