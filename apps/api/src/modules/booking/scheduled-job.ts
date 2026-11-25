// 予約の定期の仕事（booking-007）。index.ts が scheduledJob として出し、組み立てが共通の窓口（POST /api/v1/jobs/tick。
// core-017）に渡す。Cloud Scheduler は共通の窓口だけを5分ごとに呼び、窓口が10分ごと・日本時間 9時〜23時台の回にこれを動かす
// （8時台は DB の起動を待つ。AD-10・AD-24）。予約の窓口（POST /api/v1/booking/jobs/tick）も同じ関数を呼ぶ（テストと手元の確かめ用）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import type { ScheduledJob } from "../../kernel/scheduled-job.ts";
import { runWaitlistJob } from "./waitlist.ts";

/** 予約の定期の仕事：対象の交流会ごとに、打診の片付け（期限切れ・繰り上げ・当日の空き）と変更の知らせ。答えは数だけ。 */
export const bookingScheduledJob = {
  everyMinutes: 10,
  hours: [9, 23],
  /**
   * 1回分の仕事をする（booking-004 research R9・R10）。
   * @param deps 土台が渡す道具
   * @returns 数だけ（交流会・期限切れ・打診・当日の空き・変更）
   */
  run: (deps: DomainRouteDeps) => runWaitlistJob(deps, new Date()),
} as const satisfies ScheduledJob;
