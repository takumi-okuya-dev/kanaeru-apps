// 直前に開いた試合表の記録（core-022）：読む・書く。鍵は試合表の写しの片付けが消す頭（kanaeru.match.）で始める。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAST_TABLE_KEY, readLastTable, writeLastTable } from "./last-table.ts";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("直前に開いた試合表の記録", () => {
  it("書いたものを読める。何もなければ undefined", () => {
    expect(readLastTable()).toBeUndefined();
    writeLastTable("t1");
    expect(readLastTable()).toBe("t1");
  });

  it("鍵は kanaeru.match. で始まる（利用者が替わったときの片付けが、写しと同じ時に消す）", () => {
    expect(LAST_TABLE_KEY.startsWith("kanaeru.match.")).toBe(true);
  });

  it("空の文字は記録しない・読まない", () => {
    writeLastTable("");
    expect(readLastTable()).toBeUndefined();
    window.localStorage.setItem(LAST_TABLE_KEY, "");
    expect(readLastTable()).toBeUndefined();
  });

  it("localStorage が使えなくても、投げない（記録がないのと同じ）", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("使えない");
      },
    });
    try {
      expect(() => writeLastTable("t1")).not.toThrow();
      expect(readLastTable()).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
