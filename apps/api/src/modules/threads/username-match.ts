// ユーザー名だけが同じ運用アカウントの、今のユーザー名の確かめ（threads-012。めぐるの connection/username-match.ts を写した）。
// Threads では手放されたユーザー名を別の人が取れるので、名前だけが同じことで「もうつながっている」と決めつけない。
// つなぐ前に、ユーザー ID が違ってユーザー名が同じ運用アカウントを探し、持っているトークンでプロフィールを読み直す。
// 名前が変わっていれば、その運用アカウントのユーザー名と表示名を新しくする（読めないときは何もせず、同じ名前のまま比べる）。
// トークン・Threads の答えの本文をログに出さない（ID とエラーの種類だけ）。
import { normalizeUsername } from "@workspace/contracts/threads";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { loadCredentials } from "./connection.ts";
import { lockKey } from "./locks.ts";
import { threadsAccount } from "./schema.ts";
import type { ThreadsClient, ThreadsProfile } from "./threads-client.ts";

/**
 * ユーザー ID は違うがユーザー名が同じ運用アカウントを、持っているトークンで読み直す。
 * トランザクションの外で呼ぶ（Threads への問い合わせを含むため）。同じかどうかの比べは、つなぐトランザクションの中で行う。
 * @param deps 土台が渡す道具（DB・秘密の箱・ログ）
 * @param threads Threads の API の呼び出し
 * @param profile つなごうとしている Threads のアカウントのプロフィール
 */
export async function refreshUsernameOnlyMatch(
  deps: Pick<DomainRouteDeps, "db" | "secretBox" | "logger">,
  threads: ThreadsClient,
  profile: ThreadsProfile,
): Promise<void> {
  const target = normalizeUsername(profile.username);
  const matches = await deps.db
    .select({ id: threadsAccount.id, username: threadsAccount.username })
    .from(threadsAccount)
    .where(
      and(
        sql`lower(${threadsAccount.username}) = ${target}`,
        ne(threadsAccount.threadsUserId, profile.id),
      ),
    );
  for (const match of matches) {
    const cred = await loadCredentials(deps.db, deps.secretBox, match.id, deps.logger);
    if (!cred?.token || cred.connectionStatus !== "connected") continue;
    try {
      const current = await threads.getProfile(cred.token);
      if (match.username !== null && normalizeUsername(current.username) === target) continue;
      await deps.db.transaction(async (tx) => {
        // つなぐ処理と同じ名前の鍵を取り、書きかえの間に同じ名前でつながないようにする
        await lockKey(tx, `threads_username:${normalizeUsername(current.username)}`);
        // 世代を条件にし、その間のつなぎ直しを上書きしない
        await tx
          .update(threadsAccount)
          .set({ username: current.username, displayName: current.name })
          .where(
            and(
              eq(threadsAccount.id, match.id),
              eq(threadsAccount.connectionGeneration, cred.generation),
            ),
          );
      });
    } catch (error) {
      deps.logger.info(
        { threadsAccountId: match.id, errorName: (error as Error).name },
        "ユーザー名だけが同じ運用アカウントのプロフィールを読み直せませんでした",
      );
    }
  }
}
