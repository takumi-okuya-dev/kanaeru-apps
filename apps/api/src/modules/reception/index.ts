// 受付の領域の入口（docs/apps/reception.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域（survey・booking）とほかのアプリは、ここからだけ読む（AD-3：チェックインと名前は findCheckin・getCheckin・listCheckins。AD-6。
// チェックインした人と「チェックインしたか」は listEventAttendees・hasCheckedIn〈FR-B103〉、手でのチェックインを作るのは createManualCheckin。
// reception は booking を読まない。AD-23）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { receptionRoutes } from "./routes.ts";

// ほかの領域が読むもの
// - 表は外部キーのためだけ（survey_answer.checkin_id → .references(() => checkinTable.id, { onDelete: "cascade" })。
//   読み書きに使わない。AD-3・AD-7）
export { checkin as checkinTable } from "./schema.ts";
export {
  findCheckin,
  getCheckin,
  hasCheckedIn,
  listCheckins,
  listEventAttendees,
} from "./repository.ts";
export type { CheckinRecord, EventAttendee } from "./repository.ts";
export { createManualCheckin } from "./manual.ts";
export type { ManualCheckinRequest } from "./manual.ts";

/**
 * 受付の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return receptionRoutes(deps);
}
