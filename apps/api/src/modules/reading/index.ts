// 読書記録の領域の入口（docs/apps/reading.md・docs/rules/coding.md 6-6）。読書記録（key は reading）の1つの領域（AD-32）。
// 土台（app.ts）は routes を読む。窓口は routes.ts（reading-001 pr2）。
// 退会の前の手順（withdrawal）は出さない（持ち主を指す外部キーの CASCADE で、account と一緒に消える。AD-32・research R11）。
// ほかの領域・ほかのアプリに出す関数はない。表も出さない。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { readingRoutes } from "./routes.ts";

/**
 * 読書記録の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return readingRoutes(deps);
}
