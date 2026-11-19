// サイドバーの開閉の覚え方：はじめは出す・覚える・保存が投げても誤りにしない。
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIDEBAR_STORAGE_KEY, readSidebarOpen, writeSidebarOpen } from "./sidebar-state.ts";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("サイドバーの開閉の覚え方", () => {
  it("覚えていなければ出す", () => {
    expect(readSidebarOpen()).toBe(true);
  });

  it("隠したことを覚え、出し直しも覚える", () => {
    writeSidebarOpen(false);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("0");
    expect(readSidebarOpen()).toBe(false);
    writeSidebarOpen(true);
    expect(readSidebarOpen()).toBe(true);
  });

  it("保存が投げても誤りにしない（読めなければ出す）", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeSidebarOpen(false)).not.toThrow();
    expect(readSidebarOpen()).toBe(true);
  });
});
