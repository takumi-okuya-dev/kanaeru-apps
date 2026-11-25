// 共通の定期の仕事の窓口（POST /api/v1/jobs/tick。core-017）。Cloud Scheduler が合言葉（Authorization: Bearer）を付けて
// 5分ごと（日本時間 8時〜23時台）に呼ぶ。組み立てが集めた領域の定期の仕事のうち、その回に当たるものを同時に動かす
// （Cloud Run の1回の要求の上限 60秒に収めるため）。1つの領域の失敗で、ほかの領域を止めない。
// 答えは領域ごとの状態と時間だけ。領域の仕事の数の結果はログに出す（本文・トークンは出さない）。
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { JobTickResult as JobTickResultContract } from "@workspace/contracts/core";
import type { JobTickResult } from "@workspace/contracts/core";
import type { Logger } from "../../kernel/logger.ts";
import { AppError } from "../../kernel/errors.ts";
import { notFoundResponse } from "../../kernel/http.ts";
import { isScheduledJobDue } from "../../kernel/scheduled-job.ts";
import type { ScheduledJob } from "../../kernel/scheduled-job.ts";

/** 組み立てが渡す、領域の定期の仕事。 */
export type RegisteredScheduledJob = {
  /** 領域の名前（答えとログに出す） */
  domain: string;
  /** 間隔と時間帯 */
  schedule: Pick<ScheduledJob, "everyMinutes" | "hours">;
  /** 1回分の仕事（組み立てが、領域に渡す道具を付けて包んだもの） */
  run: () => Promise<Readonly<Record<string, number>>>;
  /** その回に動かしてよいか（属するアプリが「切」なら false。アプリに属さない領域は持たない） */
  isEnabled?: () => Promise<boolean>;
};

/** 共通の定期の仕事の窓口が使う道具。 */
export type JobTickDeps = {
  /** 定期の仕事からの要求かを確かめる（合言葉の設定がなければ、いつも false） */
  isJobRequest: (authorization: string | undefined) => boolean;
  /** 領域の定期の仕事（modules.list.ts の順） */
  jobs: readonly RegisteredScheduledJob[];
  /** ログ */
  logger: Logger;
  /** 今の時刻（テストで差しかえる。既定は今） */
  now?: () => Date;
};

/** 答え（文書の名前 JobTickResult を付けたもの）。 */
const JobTickResultSchema = JobTickResultContract.openapi("JobTickResult");

const tick = createRoute({
  method: "post",
  path: "/api/v1/jobs/tick",
  tags: ["core"],
  operationId: "runJobTick",
  summary:
    "定期の仕事を1回行う（Cloud Scheduler が5分ごとに呼ぶ。その回に当たる領域の仕事を動かす）",
  description:
    "見出し Authorization: Bearer <JOB_TRIGGER_SECRET> が要る。合わなければ 404。答えは領域ごとの状態と時間だけ。",
  responses: {
    200: {
      description: "この回の結果（領域ごとの状態と時間）",
      content: { "application/json": { schema: JobTickResultSchema } },
    },
    404: notFoundResponse,
  },
});

type JobOutcome = JobTickResult["jobs"][number];

/**
 * 領域の定期の仕事を1つ動かす（投げても外に出さず、failed にする）。
 * @param job 領域の定期の仕事
 * @param now 呼ばれた時刻
 * @param logger ログ
 * @returns その領域の状態と時間
 */
async function runOne(job: RegisteredScheduledJob, now: Date, logger: Logger): Promise<JobOutcome> {
  if (!isScheduledJobDue(job.schedule, now)) {
    return { domain: job.domain, status: "skipped", durationMs: 0 };
  }
  const startedAt = performance.now();
  try {
    if (job.isEnabled && !(await job.isEnabled())) {
      return { domain: job.domain, status: "off", durationMs: 0 };
    }
    const summary = await job.run();
    const durationMs = Math.round(performance.now() - startedAt);
    logger.info({ domain: job.domain, durationMs, summary }, "定期の仕事");
    return { domain: job.domain, status: "ran", durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    // 誤りの文には利用者の入れた値が入りうるので、名前だけを出す
    const name = error instanceof Error ? error.name : typeof error;
    logger.error({ domain: job.domain, durationMs, error: name }, "定期の仕事が失敗しました");
    return { domain: job.domain, status: "failed", durationMs };
  }
}

/**
 * 共通の定期の仕事の道を作る。
 * @param deps 道が使う道具
 * @returns 道（OpenAPIHono）
 */
export function jobTickRoutes(deps: JobTickDeps) {
  const now = deps.now ?? (() => new Date());
  return new OpenAPIHono().openapi(tick, async (c) => {
    if (!deps.isJobRequest(c.req.header("authorization"))) {
      deps.logger.warn({}, "共通の定期の仕事の窓口に、合言葉の合わない要求が来ました");
      throw new AppError("NOT_FOUND");
    }
    const at = now();
    const jobs = await Promise.all(deps.jobs.map((job) => runOne(job, at, deps.logger)));
    return c.json({ jobs }, 200);
  });
}
