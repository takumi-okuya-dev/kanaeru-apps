// Threads の入口の行き先（threads-012）：最後に開いた運用アカウント。どれも開いていなければなし。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { describe, expect, it } from "vitest";
import { lastOpenedAccount } from "./LandingPage.tsx";

/**
 * 運用アカウントを作る。
 * @param id ID
 * @param lastOpenedAt 最後に開いた日時
 * @returns 運用アカウント
 */
function account(id: string, lastOpenedAt: string | null): ThreadsAccount {
  return {
    id,
    name: id,
    counts: { needsReview: 0, approved: 0, rejected: 0, published: 0, publishFailed: 0 },
    connectionStatus: "not_connected",
    username: null,
    displayName: null,
    profilePictureUrl: null,
    lastOpenedAt,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
  };
}

describe("lastOpenedAccount", () => {
  it("最後に開いたものを選ぶ", () => {
    const accounts = [
      account("a", "2026-11-20T01:00:00.000Z"),
      account("b", null),
      account("c", "2026-11-20T03:00:00.000Z"),
    ];
    expect(lastOpenedAccount(accounts)?.id).toBe("c");
  });

  it("どれも開いていなければ、なし", () => {
    expect(lastOpenedAccount([account("a", null)])).toBeUndefined();
    expect(lastOpenedAccount([])).toBeUndefined();
  });
});
