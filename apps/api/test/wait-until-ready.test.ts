// 準備ができるまで確かめ直す（core-018。DB の変更を当てる job が DB を待つ）の単体のテスト。
import { describe, expect, it } from "vitest";
import { waitUntilReady } from "../scripts/lib/wait-until-ready.ts";

/**
 * 時刻を進めるだけの、偽の時計と待ち。
 * @returns now と sleep と、待った回数
 */
function fakeClock() {
  let time = 0;
  const waits: number[] = [];
  return {
    now: () => time,
    sleep: (ms: number) => {
      waits.push(ms);
      time += ms;
      return Promise.resolve();
    },
    waits,
  };
}

describe("準備ができるまで確かめ直す", () => {
  it("通るまで間を空けて確かめ直し、通ったら終わる", async () => {
    const clock = fakeClock();
    let calls = 0;
    const retries: number[] = [];
    await waitUntilReady(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(new Error("まだ")) : Promise.resolve();
      },
      {
        deadlineMs: 60_000,
        intervalMs: 5_000,
        now: clock.now,
        sleep: clock.sleep,
        onRetry: (attempt) => retries.push(attempt),
      },
    );
    expect(calls).toBe(3);
    expect(clock.waits).toEqual([5_000, 5_000]);
    expect(retries).toEqual([1, 2]);
  });

  it("上限までに通らなければ、最後の誤りを投げる", async () => {
    const clock = fakeClock();
    let calls = 0;
    await expect(
      waitUntilReady(
        () => {
          calls += 1;
          return Promise.reject(new Error(`失敗${calls}`));
        },
        { deadlineMs: 12_000, intervalMs: 5_000, now: clock.now, sleep: clock.sleep },
      ),
    ).rejects.toThrow("失敗3");
    expect(clock.waits).toEqual([5_000, 5_000]);
  });

  it("はじめから通れば待たない", async () => {
    const clock = fakeClock();
    await waitUntilReady(() => Promise.resolve(), {
      deadlineMs: 1_000,
      intervalMs: 5_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(clock.waits).toEqual([]);
  });
});

describe("待っても直らない誤り", () => {
  it("shouldRetry が false を返す誤りは、待たずにすぐ投げる", async () => {
    let calls = 0;
    const waits: number[] = [];
    await expect(
      waitUntilReady(
        () => {
          calls += 1;
          return Promise.reject(Object.assign(new Error("パスワード違い"), { code: "28P01" }));
        },
        {
          deadlineMs: 60_000,
          intervalMs: 5_000,
          shouldRetry: (error) => (error as { code?: string }).code !== "28P01",
          sleep: (ms) => {
            waits.push(ms);
            return Promise.resolve();
          },
        },
      ),
    ).rejects.toThrow("パスワード違い");
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
  });
});
