// Threads の運用（threads）の領域の入口（docs/apps/threads.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域に出すのは退会の手順（withdrawal）だけ（表は threads だけが読み書きする。AD-3）。組み立てが suite の段のあとに流す（AD-22）。
// 道は仕様ごとのファイルに分け（routes.ts：threads-001・routes-autopost.ts：threads-002・routes-metrics.ts：threads-003・routes-research.ts：threads-004・routes-activity.ts：threads-005・routes-analysis.ts：threads-006・routes-mention.ts：threads-007・routes-media.ts：threads-008・routes-oauth.ts：threads-010・routes-home.ts：threads-012・routes-team.ts：threads-013）、ここでつなぐ。
import type { DomainRouteDeps } from "../../kernel/http.ts";
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
