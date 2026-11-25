// 定期の仕事（core-017）。領域は index.ts から scheduledJob（間隔・時間帯・動かす関数）を出し、組み立て（app.ts）が集めて、
// 共通の窓口（platform/jobs。POST /api/v1/jobs/tick）に渡す。Cloud Scheduler は共通の窓口だけを5分ごとに呼ぶ
// （仕事を1つにまとめ、Cloud Scheduler の無料の3つに収めるため。docs/hosting-cost.md 7章）。
import type { DomainRouteDeps } from "./http.ts";

/** 共通の窓口を呼ぶ間隔（分。infra の Cloud Scheduler の仕事と同じ）。領域の間隔はこの倍数にする。 */
export const JOB_TICK_STEP_MINUTES = 5;

/** 日本時間（UTC+9）のずれ（ミリ秒）。日本は夏時間を使わない。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 領域の定期の仕事。 */
export type ScheduledJob = {
  /** 動かす間隔（分。5〜60 の 5 の倍数。毎時0分からの区切りで当てる） */
  everyMinutes: number;
  /** 動かす時間帯（日本時間の時。始めと終わりを含む。例 [8, 23] は 8時台〜23時台） */
  hours: readonly [from: number, to: number];
  /**
   * 1回分の仕事をする。答えは数だけ（ログに出す。本文・トークン・利用者の入れた値を入れない）。
   * 投げても、ほかの領域の仕事は止めない
   */
  run: (deps: DomainRouteDeps) => Promise<Readonly<Record<string, number>>>;
};

/**
 * 定期の仕事の形を確かめる（間隔は 5〜60 の 5 の倍数・時間帯は 0〜23 で始め ≤ 終わり）。
 * @param name 領域の名前（誤りの文に出す）
 * @param job 定期の仕事
 * @throws {Error} 形が合わないとき（起動を止める）
 */
export function assertScheduledJob(name: string, job: ScheduledJob): void {
  const { everyMinutes, hours } = job;
  const [from, to] = hours;
  const validMinutes =
    Number.isInteger(everyMinutes) &&
    everyMinutes >= JOB_TICK_STEP_MINUTES &&
    everyMinutes <= 60 &&
    everyMinutes % JOB_TICK_STEP_MINUTES === 0;
  const validHour = (hour: number) => Number.isInteger(hour) && hour >= 0 && hour <= 23;
  if (!validMinutes || !validHour(from) || !validHour(to) || from > to) {
    throw new Error(
      `定期の仕事の形が合わない（${name}）：間隔は ${JOB_TICK_STEP_MINUTES}〜60 の ${JOB_TICK_STEP_MINUTES} の倍数、時間帯は 0〜23 で始め ≤ 終わり`,
    );
  }
}

/**
 * その回に定期の仕事が当たるか（日本時間）。Cloud Scheduler の数秒の遅れは、5分の区切りに切り下げて吸収する。
 * @param job 定期の仕事（間隔と時間帯）
 * @param now 窓口が呼ばれた時刻
 * @returns 当たれば true
 */
export function isScheduledJobDue(
  job: Pick<ScheduledJob, "everyMinutes" | "hours">,
  now: Date,
): boolean {
  const local = new Date(now.getTime() + JST_OFFSET_MS);
  const hour = local.getUTCHours();
  const slot = local.getUTCMinutes() - (local.getUTCMinutes() % JOB_TICK_STEP_MINUTES);
  const [from, to] = job.hours;
  return hour >= from && hour <= to && slot % job.everyMinutes === 0;
}
