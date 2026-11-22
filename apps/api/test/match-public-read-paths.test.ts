// 試合表のログインなしで読める道の頭（AD-26・AD-30・core-016）の単体のテスト。
import { describe, expect, it } from "vitest";
import { collectPublicReadPaths } from "../src/app.ts";
import * as modules from "../src/modules.list.ts";
import { publicReadPaths } from "../src/modules/match/index.ts";

describe("試合表のログインなしで読める道", () => {
  it("見るだけと受付の窓口の頭を出す", () => {
    expect(publicReadPaths).toEqual(["/api/v1/match/views/", "/api/v1/match/joins/"]);
  });

  it("組み立てが試合表の頭を集める（IP ごとの回数の制限が効く）", () => {
    const collected = collectPublicReadPaths(Object.entries(modules));
    expect(collected).toEqual(expect.arrayContaining([...publicReadPaths]));
  });
});
