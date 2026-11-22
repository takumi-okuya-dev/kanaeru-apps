import { describe, expect, it } from "vitest";
import { assertScheduledJob, isScheduledJobDue } from "./scheduled-job.ts";
import type { ScheduledJob } from "./scheduled-job.ts";

/**
 * 日本時間の時刻を作る。
 * @param time 日本時間の "HH:MM:SS"
 * @returns その時刻
 */
const jst = (time: string) => new Date(`2026-11-22T${time}+09:00`);

/**
 * 何もしない仕事。
 * @returns 空の数
 */
const run: ScheduledJob["run"] = () => Promise.resolve({});

describe("定期の仕事が当たるか（core-017）", () => {
  const every5 = { everyMinutes: 5, hours: [8, 23] } as const;
  const every10 = { everyMinutes: 10, hours: [9, 23] } as const;

  it("間隔の区切りの回だけ当たる（日本時間）", () => {
    expect(isScheduledJobDue(every5, jst("10:05:00"))).toBe(true);
    expect(isScheduledJobDue(every10, jst("10:05:00"))).toBe(false);
    expect(isScheduledJobDue(every10, jst("10:10:00"))).toBe(true);
    expect(isScheduledJobDue(every10, jst("10:00:00"))).toBe(true);
  });

  it("Cloud Scheduler の数秒〜数分の遅れは、5分の区切りに切り下げる", () => {
    expect(isScheduledJobDue(every10, jst("10:10:04"))).toBe(true);
    expect(isScheduledJobDue(every10, jst("10:14:59"))).toBe(true);
    expect(isScheduledJobDue(every10, jst("10:15:01"))).toBe(false);
  });

  it("時間帯の外は当たらない（始めと終わりの時は含む）", () => {
    expect(isScheduledJobDue(every10, jst("08:30:00"))).toBe(false);
    expect(isScheduledJobDue(every10, jst("09:00:00"))).toBe(true);
    expect(isScheduledJobDue(every5, jst("23:55:00"))).toBe(true);
    expect(isScheduledJobDue(every5, jst("00:00:00"))).toBe(false);
    expect(isScheduledJobDue(every5, jst("07:55:00"))).toBe(false);
  });

  it("UTC の日付をまたいでも、日本時間で決める", () => {
    // 日本時間 8時05分 ＝ UTC 前日の 23時05分
    expect(isScheduledJobDue(every5, new Date("2026-11-21T23:05:00Z"))).toBe(true);
  });

  it("形が合わない仕事は止める", () => {
    for (const bad of [
      { everyMinutes: 7, hours: [8, 23] },
      { everyMinutes: 0, hours: [8, 23] },
      { everyMinutes: 65, hours: [8, 23] },
      { everyMinutes: 5.5, hours: [8, 23] },
      { everyMinutes: 5, hours: [8, 24] },
      { everyMinutes: 5, hours: [-1, 23] },
      { everyMinutes: 5, hours: [12, 8] },
    ] as const) {
      expect(() => assertScheduledJob("demo", { ...bad, run }), JSON.stringify(bad)).toThrow(
        "定期の仕事の形が合わない（demo）",
      );
    }
    expect(() =>
      assertScheduledJob("demo", { everyMinutes: 60, hours: [0, 23], run }),
    ).not.toThrow();
  });
});
