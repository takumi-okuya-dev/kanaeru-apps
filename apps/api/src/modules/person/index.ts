// 人物メモの領域の入口（docs/apps/person.md・docs/rules/coding.md 6-6）。人物メモ（key は person）の1つの領域（AD-31）。
// 土台（app.ts）は routes を読む。窓口は routes.ts（person-001 pr2）。
// 退会の前の手順（withdrawal）は出さない（持ち主を指す外部キーの CASCADE で、account と一緒に消える。AD-31）。
// ほかの領域・ほかのアプリに出す関数はない。表も出さない。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { personRoutes } from "./routes.ts";

/**
 * 人物メモの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return personRoutes(deps);
}
