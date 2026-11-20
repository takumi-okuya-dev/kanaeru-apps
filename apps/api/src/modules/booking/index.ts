// 予約の領域の入口（docs/apps/booking.md・docs/rules/coding.md 6-6）。受付アプリの4つ目の領域（AD-23）。土台（app.ts）は
// routes・withdrawal を読む。依存は booking → reception → event の一方向で、reception は booking を読まない。
// ほかの領域・ほかのアプリに出す関数はない（チェックインした人は reception の index.ts が出す。AD-23）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { bookingRoutes } from "./routes.ts";

// 退会の手順（AD-22。名簿は外部キーで消えるので、確かめの中身だけ。research R11）
export { bookingWithdrawal as withdrawal } from "./withdrawal.ts";

/**
 * 予約の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return bookingRoutes(deps);
}
