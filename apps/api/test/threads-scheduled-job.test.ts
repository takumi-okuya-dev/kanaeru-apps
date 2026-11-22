// Threads の定期の仕事（threads-022。core-017 の scheduledJob）の単体のテスト。
import { describe, expect, it } from "vitest";
import { collectScheduledJobs } from "../src/app.ts";
import type { DomainRouteDeps } from "../src/app.ts";
import * as modules from "../src/modules.list.ts";
import { scheduledJob } from "../src/modules/threads/index.ts";

describe("Threads の定期の仕事", () => {
  it("5分おき・日本時間 8時〜23時台（DB の夜間の停止の外）", () => {
    expect(scheduledJob.everyMinutes).toBe(5);
    expect(scheduledJob.hours).toEqual([8, 23]);
  });

  it("組み立てが共通の窓口に集める", () => {
    const jobs = collectScheduledJobs(Object.entries(modules), {} as DomainRouteDeps, []);
    expect(jobs.map((job) => job.domain)).toContain("threads");
  });
});
