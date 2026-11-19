// 受付の領域の入口（docs/apps/reception.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域（survey）は、ここからだけ読む（AD-3：チェックインと名前は findCheckin・getCheckin・listCheckins。AD-6）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { receptionRoutes } from "./routes.ts";

// ほかの領域が読むもの
// - 表は外部キーのためだけ（survey_answer.checkin_id → .references(() => checkinTable.id, { onDelete: "cascade" })。
//   読み書きに使わない。AD-3・AD-7）
export { checkin as checkinTable } from "./schema.ts";
export { findCheckin, getCheckin, listCheckins } from "./repository.ts";
export type { CheckinRecord } from "./repository.ts";

/**
 * 受付の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return receptionRoutes(deps);
}
