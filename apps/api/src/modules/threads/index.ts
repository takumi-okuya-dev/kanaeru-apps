// Threads の運用（threads）の領域の入口（docs/apps/threads.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域に出すのは退会の手順（withdrawal）だけ（表は threads だけが読み書きする。AD-3）。組み立てが suite の段のあとに流す（AD-22）。
// 定期の仕事は scheduledJob で出し、組み立てが共通の窓口（POST /api/v1/jobs/tick）から5分ごと（8〜23時台）に動かす（core-017・threads-022）。
// 道は仕様ごとのファイルに分け（routes.ts：threads-001・routes-autopost.ts：threads-002・routes-metrics.ts：threads-003・routes-research.ts：threads-004・routes-activity.ts：threads-005・routes-analysis.ts：threads-006・routes-mention.ts：threads-007・routes-media.ts：threads-008・routes-oauth.ts：threads-010・routes-home.ts：threads-012・routes-team.ts：threads-013）、ここでつなぐ。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import type { ScheduledJob } from "../../kernel/scheduled-job.ts";
import { threadsClientOf } from "./connection.ts";
import { runJob } from "./job-runner.ts";
import { threadsRoutes } from "./routes.ts";
import { activityRoutes } from "./routes-activity.ts";
import { analysisRoutes } from "./routes-analysis.ts";
import { homeRoutes } from "./routes-home.ts";
import { mediaRoutes } from "./routes-media.ts";
import { mentionRoutes } from "./routes-mention.ts";
import { oauthRoutes } from "./routes-oauth.ts";
import { autopostRoutes } from "./routes-autopost.ts";
import { metricsRoutes } from "./routes-metrics.ts";
import { researchRoutes } from "./routes-research.ts";
import { teamRoutes } from "./routes-team.ts";

export { threadsWithdrawal as withdrawal } from "./withdrawal.ts";

/**
 * 定期の仕事（続きの処理・来ている時刻の投稿・時間差のメンションの返信・URL の取り直し・トークンの延長・反応の取りこみ・片付け）。
 * 5分ごと・日本時間 8時〜23時台（DB の夜間の停止の外。PRD B9）。
 */
export const scheduledJob: ScheduledJob = {
  everyMinutes: 5,
  hours: [8, 23],
  /**
   * 1回分の仕事をする。
   * @param deps 土台が渡す道具
   * @returns この回の結果（数だけ）
   */
  run: (deps) => runJob(deps, threadsClientOf(deps)),
};

/**
 * Threads の運用の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return threadsRoutes(deps)
    .route("/", autopostRoutes(deps))
    .route("/", metricsRoutes(deps))
    .route("/", researchRoutes(deps))
    .route("/", activityRoutes(deps))
    .route("/", analysisRoutes(deps))
    .route("/", mentionRoutes(deps))
    .route("/", mediaRoutes(deps))
    .route("/", oauthRoutes(deps))
    .route("/", homeRoutes(deps))
    .route("/", teamRoutes(deps));
}
