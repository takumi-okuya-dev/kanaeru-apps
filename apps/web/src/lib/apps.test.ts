// 最後に使ったアプリの覚え方と、はじめの画面で開くアプリ（core-005）：保存が投げても誤りにしない。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAST_APP_STORAGE_KEY,
  pickStartApp,
  provideStartPaths,
  readLastApp,
  startPathOf,
  writeLastApp,
} from "./apps.ts";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("最後に使ったアプリ", () => {
  it("覚えていなければ null、覚えたら読める", () => {
    expect(readLastApp()).toBeNull();
    writeLastApp("sample");
    expect(window.localStorage.getItem(LAST_APP_STORAGE_KEY)).toBe("sample");
    expect(readLastApp()).toBe("sample");
  });

  it("保存が投げても誤りにしない（読めなければ null）", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeLastApp("sample")).not.toThrow();
    expect(readLastApp()).toBeNull();
  });
});

describe("はじめの画面で開くアプリ", () => {
  const apps = [{ key: "first" }, { key: "second" }];

  it("最後に使ったアプリが並びにあればそれ、なければ並びの最初", () => {
    expect(pickStartApp(apps, "second")?.key).toBe("second");
    expect(pickStartApp(apps, "missing")?.key).toBe("first");
    expect(pickStartApp(apps, null)?.key).toBe("first");
    expect(pickStartApp([], "first")).toBeUndefined();
  });

  it("開いたときの道は、組み立てが渡した道、なければアプリの道の頭", () => {
    provideStartPaths(new Map([["first", "/first/list"]]));
    expect(startPathOf({ key: "first", basePath: "/first" })).toBe("/first/list");
    expect(startPathOf({ key: "second", basePath: "/second" })).toBe("/second");
  });
});
