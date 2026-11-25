// プロフィールの画像を出してよいか（画面の CSP の img-src と同じ置き場所だけ。core-008・threads-014）。
import { describe, expect, it } from "vitest";
import { isAllowedPictureUrl } from "./AccountSwitcher.tsx";

describe("isAllowedPictureUrl", () => {
  it("Meta の画像の置き場所の https だけを出す", () => {
    expect(isAllowedPictureUrl("https://scontent-nrt1-1.cdninstagram.com/v/t51/a.jpg")).toBe(true);
    expect(isAllowedPictureUrl("https://scontent.xx.fbcdn.net/v/a.jpg")).toBe(true);
  });

  it("ない・形が違う・http・ほかの置き場所は出さない（頭文字の箱にする）", () => {
    for (const url of [
      null,
      undefined,
      "",
      "not a url",
      "http://scontent.cdninstagram.com/a.jpg",
      "https://cdninstagram.com.evil.example/a.jpg",
      "https://127.0.0.1:9790/picture.jpg",
    ]) {
      expect(isAllowedPictureUrl(url), String(url)).toBe(false);
    }
  });
});
