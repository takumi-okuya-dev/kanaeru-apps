// テストの手伝い：Threads のアプリを台帳で「公開」にする（threads のテストが使う）。
// 台帳に行がないアプリは「運営者だけ」なので、ふつうの利用者でログインするテストの前に呼ぶ（truncateAllTables のあと）。
import type { Database } from "../../src/kernel/db.ts";
import { upsertVisibility } from "../../src/modules/suite/index.ts";

/**
 * Threads のアプリを、だれにでも見えるようにする。
 * @param database DB の接続
 */
export async function showThreadsApp(database: Database): Promise<void> {
  await upsertVisibility(database.db, "threads", "public");
}
