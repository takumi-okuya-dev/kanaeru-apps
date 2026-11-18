// アカウントの領域の入口（docs/apps/account.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes を読む。
// ほかの領域は、ここからだけ読む（AD-12：今の利用者は requireSession と currentAccount(c) で受け取る）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { accountRoutes } from "./routes.ts";

// ほかの領域が読むもの
// - 表は外部キーのためだけ（.references(() => accountTable.id, { onDelete: "cascade" })。読み書きに使わない。AD-3）
export { account as accountTable } from "./schema.ts";
export { deleteAccount, findAccountById } from "./repository.ts";
export type { AccountRecord } from "./repository.ts";
export { currentAccount, isOrganizer, requireOrganizer, requireSession } from "./session.ts";
export type { SessionAccount } from "./session.ts";
export { forbiddenResponse, unauthenticatedResponse } from "./routes.ts";

/**
 * アカウントの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return accountRoutes(deps);
}
