// チーム運用の約束（threads-013）：伸びの判定の境目と、入力の形。
import { describe, expect, it } from "vitest";
import {
  TEAM_STATUS_GROWTH_MIN_POSTS,
  TEAM_STATUS_GROWTH_POOR_RATIO,
  ThreadsAssignmentInput,
  ThreadsPlacementInput,
  teamGrowthOf,
} from "./index.ts";

describe("伸び（直近30日 ÷ その前の30日の中央値）", () => {
  const enough = TEAM_STATUS_GROWTH_MIN_POSTS;

  it("0.8 以下は伸びていない、0.8 より大きければ伸びている（比は小数第2位まで）", () => {
    expect(TEAM_STATUS_GROWTH_POOR_RATIO).toBe(0.8);
    expect(teamGrowthOf({ median: 80, count: enough }, { median: 100, count: enough })).toEqual({
      state: "poor",
      ratio: 0.8,
    });
    expect(teamGrowthOf({ median: 81, count: enough }, { median: 100, count: enough })).toEqual({
      state: "ok",
      ratio: 0.81,
    });
    expect(teamGrowthOf({ median: 200, count: enough }, { median: 300, count: enough })).toEqual({
      state: "poor",
      ratio: 0.67,
    });
  });

  it("どちらかの期間の確定が5件に満たない・中央値がない・前が0なら、まだ判定できない", () => {
    const insufficient = { state: "insufficient", ratio: null };
    expect(teamGrowthOf({ median: 10, count: enough - 1 }, { median: 10, count: enough })).toEqual(
      insufficient,
    );
    expect(teamGrowthOf({ median: 10, count: enough }, { median: 10, count: enough - 1 })).toEqual(
      insufficient,
    );
    expect(teamGrowthOf({ median: null, count: enough }, { median: 10, count: enough })).toEqual(
      insufficient,
    );
    expect(teamGrowthOf({ median: 10, count: enough }, { median: 0, count: enough })).toEqual(
      insufficient,
    );
  });
});

describe("チーム運用の入力", () => {
  it("組織に入れるは組織の ID か null（外す）", () => {
    expect(ThreadsPlacementInput.safeParse({ organizationId: null }).success).toBe(true);
    expect(ThreadsPlacementInput.safeParse({ organizationId: "x" }).success).toBe(false);
    expect(ThreadsPlacementInput.safeParse({}).success).toBe(false);
  });

  it("担当は運用アカウントと人の ID と付けるか（ほかの欄は受け取らない）", () => {
    const id = "0193a1b2-0000-7000-8000-000000000000";
    expect(
      ThreadsAssignmentInput.safeParse({ threadsAccountId: id, accountId: id, assigned: true })
        .success,
    ).toBe(true);
    expect(
      ThreadsAssignmentInput.safeParse({
        threadsAccountId: id,
        accountId: id,
        assigned: true,
        delegated: true,
      }).success,
    ).toBe(false);
  });
});
