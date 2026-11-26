// 予約のログインなしで読める道の頭（core-016）の単体のテスト。申込みのページ・カレンダー・札のページの読む要求に、
// IP ごとの回数の制限が効くこと（2回目のセキュリティ点検 D2 の F2）。
import { describe, expect, it } from "vitest";
import { collectPublicReadPaths } from "../src/app.ts";
import * as modules from "../src/modules.list.ts";
import { publicReadPaths } from "../src/modules/booking/index.ts";

describe("予約のログインなしで読める道", () => {
  it("申込みのページ（交流会の道）と札のページの頭を出す", () => {
    expect(publicReadPaths).toEqual(["/api/v1/booking/events/", "/api/v1/booking/entry-tokens/"]);
  });

  it("組み立てが予約の頭を集める（IP ごとの回数の制限が効く）", () => {
    const collected = collectPublicReadPaths(Object.entries(modules));
    expect(collected).toEqual(expect.arrayContaining([...publicReadPaths]));
  });
});
