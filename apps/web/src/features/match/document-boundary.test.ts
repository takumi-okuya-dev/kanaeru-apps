// 試合表の道へ画面の中で入るときの読み直し（document-boundary.ts）：ほかの道で開いた文書から入るときだけ読み直す
// （カメラを許す Permissions-Policy と Service Worker は文書ごとに決まるため）。試合表の道の中の行き来・先読みは読み直さない。
import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  documentPathname,
  isMatchDocumentPath,
  mustReloadIntoMatch,
  reloadIntoMatchIfNeeded,
} from "./document-boundary.ts";

/**
 * 今の文書を読みこんだ URL を、Navigation Timing の形で差しかえる。
 * @param url 文書の URL（undefined なら、記録がない形）
 */
function stubDocumentUrl(url: string | undefined): void {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    url === undefined ? [] : ([{ name: url }] as unknown as PerformanceEntryList),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isMatchDocumentPath", () => {
  it("試合表の道（/match・/match/…）だけ。似た道・大文字は含めない", () => {
    for (const path of ["/match", "/match/", "/match/tables/x/board", "/match/view/abc"]) {
      expect(isMatchDocumentPath(path), path).toBe(true);
    }
    for (const path of ["/", "/apps", "/matches", "/matchx/view", "/Match", "/admin/match"]) {
      expect(isMatchDocumentPath(path), path).toBe(false);
    }
  });
});

describe("mustReloadIntoMatch", () => {
  it("ほかの道で開いた文書から試合表の道へ入るときだけ読み直す", () => {
    expect(mustReloadIntoMatch("/apps", "/match")).toBe(true);
    expect(mustReloadIntoMatch("/", "/match/tables/x/board")).toBe(true);
    // LIFF の入口（/?liff.state=…）で開いて、画面の中で試合表の道へ移ったときも
    expect(mustReloadIntoMatch("/", "/match/view/abc")).toBe(true);
  });

  it("試合表の道で開いた文書の中の行き来・ほかの道どうし・分からないときは読み直さない", () => {
    expect(mustReloadIntoMatch("/match", "/match/tables/x")).toBe(false);
    expect(mustReloadIntoMatch("/match/view/abc", "/match")).toBe(false);
    expect(mustReloadIntoMatch("/apps", "/admin/events")).toBe(false);
    expect(mustReloadIntoMatch(undefined, "/match")).toBe(false);
  });
});

describe("documentPathname", () => {
  it("Navigation Timing の文書の URL の道を返す（記録がなければ undefined）", () => {
    stubDocumentUrl("https://example.test/apps?x=1#y");
    expect(documentPathname()).toBe("/apps");
    stubDocumentUrl(undefined);
    expect(documentPathname()).toBeUndefined();
  });
});

describe("reloadIntoMatchIfNeeded", () => {
  const target = { pathname: "/match", href: "/match?from=apps" };

  it("ほかの道で開いた文書なら、同じ URL でページを読み直す redirect を投げる（履歴を増やさない）", () => {
    stubDocumentUrl("https://example.test/apps");
    let thrown: unknown;
    try {
      reloadIntoMatchIfNeeded({ location: target, preload: false });
    } catch (caught) {
      thrown = caught;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: unknown }).options).toMatchObject({
      href: "/match?from=apps",
      reloadDocument: true,
      replace: true,
    });
  });

  it("試合表の道で開いた文書・先読みでは投げない", () => {
    stubDocumentUrl("https://example.test/match/view/abc");
    expect(() => reloadIntoMatchIfNeeded({ location: target, preload: false })).not.toThrow();
    stubDocumentUrl("https://example.test/apps");
    expect(() => reloadIntoMatchIfNeeded({ location: target, preload: true })).not.toThrow();
  });
});
