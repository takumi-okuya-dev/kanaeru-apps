// 人物メモのアカウント：アカウント名から相手のページの URL を組み立てる・LINE ID のリンク・そのほかの URL は http と https だけ
// （research R4・R5）。
import { describe, expect, it } from "vitest";
import { accountUrl, isHttpUrl } from "./index.ts";

describe("アカウントの URL", () => {
  it("X・connpass・GitHub・LinkedIn のアカウント名から URL を組み立てる（頭の @ と前後の空白を外す）", () => {
    expect(accountUrl("x", "@example")).toBe("https://x.com/example");
    expect(accountUrl("x", " example ")).toBe("https://x.com/example");
    expect(accountUrl("connpass", "taro")).toBe("https://connpass.com/user/taro/");
    expect(accountUrl("github", "@octocat")).toBe("https://github.com/octocat");
    expect(accountUrl("linkedin", "taro-tanaka")).toBe("https://www.linkedin.com/in/taro-tanaka/");
  });

  it("LINE ID は「ID で友だちを探す」リンク", () => {
    expect(accountUrl("line", "taro.line")).toBe("https://line.me/R/ti/p/~taro.line");
    expect(accountUrl("line", "@taro")).toBe("https://line.me/R/ti/p/~taro");
  });

  it("アカウント名の中の記号は道の文字として逃がす（ほかの道や問い合わせにしない）", () => {
    expect(accountUrl("github", "a/b?c")).toBe("https://github.com/a%2Fb%3Fc");
  });

  it("そのサービスの URL を貼ったら、そのまま使う。ほかの所の URL は使わない", () => {
    expect(accountUrl("x", "https://x.com/example")).toBe("https://x.com/example");
    expect(accountUrl("github", "https://github.com/octocat")).toBe("https://github.com/octocat");
    expect(accountUrl("x", "https://evil.example.com/x.com")).toBeNull();
  });

  it("空なら null", () => {
    expect(accountUrl("x", "")).toBeNull();
    expect(accountUrl("x", " @ ")).toBeNull();
    expect(accountUrl("url", null)).toBeNull();
  });

  it("そのほかの URL は http と https だけ", () => {
    expect(accountUrl("url", "https://example.com/taro")).toBe("https://example.com/taro");
    expect(accountUrl("url", "http://example.com")).toBe("http://example.com");
    expect(accountUrl("url", "javascript:alert(1)")).toBeNull();
    expect(accountUrl("url", "tel:0312345678")).toBeNull();
    expect(accountUrl("url", "data:text/html,x")).toBeNull();
    expect(isHttpUrl("HTTPS://EXAMPLE.COM")).toBe(true);
    expect(isHttpUrl("https://")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
  });
});
