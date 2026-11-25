// threads の鍵（同時に来ても守りたい決まりのために、トランザクションの間だけかける pg_advisory_xact_lock）。
import { sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";

/**
 * 名前ごとの鍵をかける（同じ名前の書きこみを1つずつにする）。鍵はトランザクションの終わりに外れる。
 * 値は命令の引数で渡す（文字のつなぎで命令を作らない）。
 * @param tx トランザクション
 * @param key 鍵の名前
 */
export async function lockKey(tx: Executor, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
