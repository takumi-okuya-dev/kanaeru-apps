// 共通の定期の仕事の窓口（POST /api/v1/jobs/tick。core-017）の結合のテスト。見本の領域の scheduledJob で確かめる。
import type { JobTickResult } from "@workspace/contracts/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainModule } from "../src/app.ts";
import { upsertVisibility } from "../src/modules/suite/index.ts";
import { buildApp, testConfig } from "./helpers/app.ts";
import { DEMO_APP, DEMO_APP_KEY } from "./helpers/suite.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();

/** テストの合言葉。 */
const SECRET = "test-job-secret-for-core-017";

/** 動いた領域の名前（仕事が呼ばれた順）。 */
let calls: string[] = [];

/**
 * 見本の領域（呼ばれたら名前を残す定期の仕事を持つ）を作る。
 * @param name 残す名前
 * @param schedule 間隔と時間帯
 * @param schedule.everyMinutes 間隔（分）
 * @param schedule.hours 時間帯
 * @param fail 投げるなら true
 * @returns 領域
 */
function jobModule(
  name: string,
  schedule: { everyMinutes: number; hours: readonly [number, number] },
  fail = false,
): DomainModule {
  return {
    scheduledJob: {
      ...schedule,
      run: () => {
        calls.push(name);
        return fail ? Promise.reject(new Error("見本の失敗")) : Promise.resolve({ done: 1 });
      },
    },
  };
}

/**
 * 日本時間の時刻にして、共通の窓口を呼ぶ。
 * @param app 組み立てた API
 * @param time 日本時間の "HH:MM:SS"
 * @param authorization 見出し Authorization（既定は正しい合言葉）
 * @returns 応答
 */
async function tickAt(
  app: ReturnType<typeof buildApp>,
  time: string,
  authorization = `Bearer ${SECRET}`,
): Promise<Response> {
  vi.setSystemTime(new Date(`2026-11-22T${time}+09:00`));
  return app.request("/api/v1/jobs/tick", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: "{}",
  });
}

/**
 * 応答の領域ごとの結果を読む。
 * @param response 共通の窓口の応答
 * @returns 領域ごとの結果
 */
async function jobsOf(response: Response): Promise<JobTickResult["jobs"]> {
  return ((await response.json()) as JobTickResult).jobs;
}

describe("共通の定期の仕事の窓口（core-017）", () => {
  beforeEach(async () => {
    await truncateAllTables(database);
    calls = [];
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 5分ごと（8〜23時）の demo と、10分ごと（9〜23時）の見本の領域を持つ API。 */
  const build = (fail = false) =>
    buildApp(database, testConfig({ jobTriggerSecret: SECRET }), {
      extraModules: {
        demo: jobModule("demo", { everyMinutes: 5, hours: [8, 23] }, fail),
        later: jobModule("later", { everyMinutes: 10, hours: [9, 23] }),
      },
      extraApps: [{ ...DEMO_APP, domains: ["demo", "later"] }],
    });

  it("その回に当たる領域の仕事だけを動かし、領域ごとの状態を返す", async () => {
    await upsertVisibility(database.db, DEMO_APP_KEY, "public");
    const app = build();

    const at1005 = await tickAt(app, "10:05:02");
    expect(at1005.status).toBe(200);
    expect(await at1005.json()).toEqual({
      jobs: [
        { domain: "demo", status: "ran", durationMs: expect.any(Number) as number },
        { domain: "later", status: "skipped", durationMs: 0 },
      ],
    });
    expect(calls).toEqual(["demo"]);

    calls = [];
    const at1010 = await tickAt(app, "10:10:00");
    expect((await jobsOf(at1010)).map((job) => job.status)).toEqual(["ran", "ran"]);
    expect(calls.sort()).toEqual(["demo", "later"]);

    calls = [];
    await tickAt(app, "08:30:00");
    expect(calls).toEqual(["demo"]);
  });

  it("合言葉がない・違うときは 404 で、何も動かさない", async () => {
    const app = build();
    expect((await tickAt(app, "10:10:00", "")).status).toBe(404);
    expect((await tickAt(app, "10:10:00", "Bearer wrong")).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("合言葉の設定がなければ 404", async () => {
    const app = buildApp(database, testConfig({ jobTriggerSecret: undefined }), {
      extraModules: { demo: jobModule("demo", { everyMinutes: 5, hours: [0, 23] }) },
      extraApps: [DEMO_APP],
    });
    expect((await tickAt(app, "10:10:00")).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("1つの領域が投げても、ほかの領域は動き、その領域は failed", async () => {
    await upsertVisibility(database.db, DEMO_APP_KEY, "operator_only");
    const app = build(true);
    const response = await tickAt(app, "10:10:00");
    expect(response.status).toBe(200);
    expect(await jobsOf(response)).toEqual([
      { domain: "demo", status: "failed", durationMs: expect.any(Number) as number },
      { domain: "later", status: "ran", durationMs: expect.any(Number) as number },
    ]);
    expect(calls.sort()).toEqual(["demo", "later"]);
  });

  it("属するアプリが「切」なら動かさない（運営者だけなら動く）", async () => {
    await upsertVisibility(database.db, DEMO_APP_KEY, "off");
    const app = build();
    expect(await jobsOf(await tickAt(app, "10:10:00"))).toEqual([
      { domain: "demo", status: "off", durationMs: 0 },
      { domain: "later", status: "off", durationMs: 0 },
    ]);
    expect(calls).toEqual([]);
  });

  it("形の合わない定期の仕事は、組み立てを止める", () => {
    expect(() =>
      buildApp(database, testConfig(), {
        extraModules: { demo: jobModule("demo", { everyMinutes: 7, hours: [8, 23] }) },
        extraApps: [DEMO_APP],
      }),
    ).toThrow("定期の仕事の形が合わない（demo）");
  });
});
