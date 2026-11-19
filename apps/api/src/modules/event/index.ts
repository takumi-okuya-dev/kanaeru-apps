// 交流会の領域の入口（docs/apps/event.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域は、ここからだけ読む（AD-5：交流会ごとの権限は requireEventRole・currentEventRole・getEventRole、
// 参加者に見せてよい交流会の欄は getEventSummary）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { eventRoutes } from "./routes.ts";

// ほかの領域が読むもの
// - 表は外部キーのためだけ（.references(() => eventTable.id, { onDelete: "restrict" })。読み書きに使わない。AD-3・AD-7）
export { event as eventTable } from "./schema.ts";
export { currentEventRole, getEventRole, requireEventRole } from "./access.ts";
export { getEventSummary } from "./summary.ts";
export { eventForbiddenResponse, eventNotFoundResponse } from "./routes.ts";

/**
 * 交流会の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return eventRoutes(deps);
}
