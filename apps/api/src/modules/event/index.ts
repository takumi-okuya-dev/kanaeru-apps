// 交流会の領域の入口（docs/apps/event.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes・withdrawal を読む。
// ほかの領域は、ここからだけ読む（AD-5・AD-23：交流会ごとの権限〈主催者・受付係・部員〉は requireEventRole・currentEventRole・getEventRole、
// 参加者に見せてよい交流会の欄は getEventSummary。チェックインに写す割引は findEventDiscount・listEventDiscounts）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { eventRoutes } from "./routes.ts";

// ほかの領域が読むもの
// - 表は外部キーのためだけ（.references(() => eventTable.id, { onDelete: "restrict" })。読み書きに使わない。AD-3・AD-7）
//   割引の表は、reception の checkin の (event_id, discount_id) の複合の外部キーのためだけ（reception-002）
export { event as eventTable, eventDiscount as eventDiscountTable } from "./schema.ts";
export { findEventDiscount, listEventDiscounts } from "./discounts.ts";
export type { EventDiscountRecord } from "./discounts.ts";
export { currentEventRole, getEventRole, requireEventRole } from "./access.ts";
export { getEventSummary } from "./summary.ts";
// 交流会の持ち主（booking が CSV の列の対応を持ち主ごとに覚えるため。booking-001）
export { findEventOwnerAccountId } from "./repository.ts";
// 交流会を入れた組織（booking が知らせに使う公式アカウントの設定を決めるため。booking-002）
export { findEventOrganizationId } from "./repository.ts";
export { eventForbiddenResponse, eventNotFoundResponse } from "./routes.ts";
// 退会の手順（AD-22 の (2)。組み立てが suite の段のあとに流す。event-002）
export { eventWithdrawal as withdrawal, listPersonalEventIds } from "./withdrawal.ts";

/**
 * 交流会の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return eventRoutes(deps);
}
