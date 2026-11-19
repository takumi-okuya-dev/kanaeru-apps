// 手元のログインの戻る道：同じ源の道だけを受け取り、外の源へ移る形（//・\・タブや改行で // になるもの）は受け取らない。
import { describe, expect, it } from "vitest";
import { isSafeRedirect } from "./routes.ts";

describe("isSafeRedirect", () => {
  it("/ で始まる同じ源の道は使える", () => {
    for (const value of ["/", "/events", "/events/1?tab=a#top", "/a//b"]) {
      expect(isSafeRedirect(value)).toBe(true);
    }
  });

  it("外の源へ移る形・道でないものは使えない", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\\/evil.example",
      "/events\\..\\x",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "events",
      "",
      undefined,
      ["/events"],
    ]) {
      expect(isSafeRedirect(value)).toBe(false);
    }
  });
});
