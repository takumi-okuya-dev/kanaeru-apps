// 組織の招待のリンクの中身（suite-001）：LIFF ID があればミニアプリの URL（AD-14）、なければ画面の源＋招待の道。
import { describe, expect, it } from "vitest";
import { joinLinkValue } from "./organization-links.ts";

/** 試しの LIFF ID。 */
const LIFF_ID = "1234567890-AbCdEfGh";

describe("組織の招待のリンク", () => {
  it("LIFF ID があれば、ミニアプリの URL に招待の道を入れる", () => {
    expect(joinLinkValue("abc_DEF-123", LIFF_ID)).toBe(
      `https://miniapp.line.me/${LIFF_ID}/join/abc_DEF-123`,
    );
  });

  it("LIFF ID がなければ、画面の源＋招待の道", () => {
    expect(joinLinkValue("abc", "", "http://localhost:5173")).toBe(
      "http://localhost:5173/join/abc",
    );
  });
});
