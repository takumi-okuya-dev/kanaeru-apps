// アンケートの領域の入口（docs/apps/survey.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域に出す関数はまだない（回答の表は survey だけが読み書きする。AD-3）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { surveyRoutes } from "./routes.ts";

/**
 * アンケートの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return surveyRoutes(deps);
}
