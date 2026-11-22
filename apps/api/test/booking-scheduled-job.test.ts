// 予約の定期の仕事（booking-007）：間隔と時間帯・組み立てが集める・共通の窓口（POST /api/v1/jobs/tick。core-017）から動く。
// 名前はどれも架空のもの。
import "@hono/zod-openapi";
import type { JobTickResult } from "@workspace/contracts/core";
import { listApps } from "@workspace/contracts/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./helpers/app.ts";
import type { TestApp } from "./helpers/app.ts";
import { loginAs } from "./helpers/account.ts";
import { apply, openSelfPage } from "./helpers/booking-apply.ts";
import { notifyConfig } from "./helpers/booking-notify.ts";
import { TEST_JOB_SECRET, setCapacity, statusOf } from "./helpers/booking-waitlist.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";
import { createEvent } from "./helpers/event.ts";
import { collectScheduledJobs } from "../src/app.ts";
import type { DomainRouteDeps } from "../src/kernel/http.ts";
import { JOB_TICK_STEP_MINUTES, isScheduledJobDue } from "../src/kernel/scheduled-job.ts";
import * as modules from "../src/modules.list.ts";
import { scheduledJob } from "../src/modules/booking/index.ts";

const database = useTestDatabase();

/** 共通の窓口を呼ぶ区切り（ミリ秒）。 */
const STEP_MS = JOB_TICK_STEP_MINUTES * 60 * 1000;

/**
 * 予約の定期の仕事が当たる、次の回の時刻（その時刻を含む）。
 * @param from 探し始める時刻
 * @returns 当たる回の時刻
 */
function nextDueSlot(from: Date): Date {
  let at = new Date(Math.ceil(from.getTime() / STEP_MS) * STEP_MS);
  while (!isScheduledJobDue(scheduledJob, at)) at = new Date(at.getTime() + STEP_MS);
  return at;
}

/**
 * その時刻にして、共通の窓口を呼び、予約の領域の結果を読む。
 * @param app 組み立てた API
 * @param at 呼ぶ時刻
 * @returns 予約の領域の結果
 */
async function tickSharedAt(app: TestApp, at: Date): Promise<JobTickResult["jobs"][number]> {
  vi.setSystemTime(at);
  const response = await app.request("/api/v1/jobs/tick", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TEST_JOB_SECRET}` },
    body: "{}",
  });
  expect(response.status).toBe(200);
  // ほかの領域の定期の仕事も並ぶので、予約の領域だけを見る（領域の数や並びをテストに書かない）
  const job = ((await response.json()) as JobTickResult).jobs.find(
    (item) => item.domain === "booking",
  );
  if (!job) throw new Error("共通の窓口の答えに予約の領域がありません。");
  return job;
}

describe("予約の定期の仕事（booking-007）", () => {
  it("10分ごと・日本時間 9時〜23時台に動く（8時台は DB の起動を待つ）", () => {
    expect(scheduledJob.everyMinutes).toBe(10);
    expect(scheduledJob.hours).toEqual([9, 23]);
  });

  it("組み立てが予約の定期の仕事を集める", () => {
    // 集めるだけで動かさないので、道具は使わない
    const jobs = collectScheduledJobs(Object.entries(modules), {} as DomainRouteDeps, listApps());
    expect(jobs.find((job) => job.domain === "booking")?.schedule).toEqual({
      everyMinutes: 10,
      hours: [9, 23],
    });
  });
});

describe("共通の窓口から予約の定期の仕事が動く（booking-007）", () => {
  let app: TestApp;
  let waiting: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig({}, { jobTriggerSecret: TEST_JOB_SECRET }));
    const owner = await loginAs(app, { displayName: "高橋" });
    const eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    await openSelfPage(app, owner.cookie, eventId);
    await setCapacity(app, owner.cookie, eventId, 1);
    const ids: string[] = [];
    for (const name of ["中村 さき", "森 はるか"]) {
      const person = await loginAs(app, { displayName: name });
      const response = await apply(app, person.cookie, eventId, { name });
      ids.push(((await response.json()) as { entry: { id: string } }).entry.id);
    }
    const [confirmed, waitlisted] = ids;
    if (!confirmed || !waitlisted) throw new Error("申し込めませんでした。");
    waiting = waitlisted;
    // 片付けを通さずに席を空ける（定期の仕事が拾う形）
    await database.pool.query("UPDATE booking_entry SET status = 'cancelled' WHERE id = $1", [
      confirmed,
    ]);
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("当たる回だけ動き、空いた席をキャンセル待ちの先頭に打診する", async () => {
    const due = nextDueSlot(new Date());

    // 10分の区切りでない回（か時間帯の外）は動かさない
    expect(await tickSharedAt(app, new Date(due.getTime() - STEP_MS))).toEqual({
      domain: "booking",
      status: "skipped",
      durationMs: 0,
    });
    expect(await statusOf(database, waiting)).toBe("waitlisted");

    expect(await tickSharedAt(app, due)).toMatchObject({ domain: "booking", status: "ran" });
    expect(await statusOf(database, waiting)).toBe("offered");
  });
});
