// 試合表の領域の入口（見せる・受け付ける窓口は routes-share.ts。docs/apps/match.md・docs/rules/coding.md 6-6）。試合表アプリ（key は match）の1つの領域（AD-25）。
// 土台（app.ts）は routes・withdrawal・publicReadPaths を読む。ほかの領域・ほかのアプリに出す関数はない。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { matchRoutes } from "./routes.ts";
import { matchShareRoutes } from "./routes-share.ts";

// 退会の手順（AD-22 の (2)。組織に入れた試合表を管理者に引き継ぐ。match-001 research R3）
export { matchWithdrawal as withdrawal } from "./withdrawal.ts";
/** ログインなしで読める道の頭（AD-26・AD-30。組み立てが集めて、読む要求にも IP ごとの回数の制限をかける。core-016）。 */
export const publicReadPaths = ["/api/v1/match/views/", "/api/v1/match/joins/"] as const;

/**
 * 試合表の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return matchRoutes(deps).route("/", matchShareRoutes(deps));
}
