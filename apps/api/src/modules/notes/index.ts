// メモの領域の入口（docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。ほかの領域は、ここからだけ読む。
// メモは、領域の作り方を見せる見本（docs/apps/notes.md）。プロダクトを始めたら、消すか作り替える。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { noteRoutes } from "./routes.ts";

// ほかの領域が読むもの（ほかの領域は notes の中のファイルを読めないので、ここから出す）
export { note } from "./schema.ts";

/**
 * メモの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return noteRoutes(deps);
}
