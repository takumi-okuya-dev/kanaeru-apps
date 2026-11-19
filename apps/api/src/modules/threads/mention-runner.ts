// 時間差のメンションの返信の段階（threads-007。めぐるの mention/mention-runner.ts を写した）。定期の仕事（job-runner.ts）が公開のあとに呼ぶ。
// 承認した返信の文は書き換えずに出し、出せないときは出さない。二重に出さないため、公開と同じく、公開を送る前に
// コンテナーの ID と publish_requested_at を保存し、結果がわからなければ次の回にコンテナーの状態を確かめる。
// 定期の仕事は夜間（日本時間 0時〜8時。DB の停止）は動かないので、夜間に来た返信は 8時からの回で出す（24時間を過ぎたら出さない）。
// ログは ID と数だけ（返信の文・トークンを出さない）。
import {
  MENTION_EXPIRE_HOURS,
  MENTION_MAX_ATTEMPTS,
  MENTION_MAX_PER_TICK,
  MENTION_SAME_PERSON_HOURS,
  findNgWords,
  mentionDueAt,
} from "@workspace/contracts/threads";
import type { MentionFailureReason } from "@workspace/contracts/threads";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { loadCredentials, markNeedsReconnect } from "./connection.ts";
import { listNgWords } from "./repository.ts";
import { threadsAccount, threadsPostDraft, threadsPostMention } from "./schema.ts";
import {
  ThreadsApiError,
  ThreadsAuthError,
  ThreadsPermissionError,
  ThreadsRateLimitError,
  ThreadsTransientError,
} from "./threads-client.ts";
import type { ThreadsClient } from "./threads-client.ts";

const HOUR_MS = 3_600_000;
const LEASE_MS = 5 * 60_000;
const RETRY_STEP_MS = 5 * 60_000;

/** この段階の結果。 */
export type MentionStageResult = { sent: number; failed: number; waiting: number };

/** 案の時間差のメンションの行。 */
type MentionRow = typeof threadsPostMention.$inferSelect;

/** 返信の時刻（投稿済みに付けたものは押した時刻、ほかは投稿の時刻＋時間差）。 */
const dueAtSql = sql`COALESCE(${threadsPostMention.sendAfter}, ${threadsPostDraft.publishedAt} + make_interval(mins => ${threadsPostMention.delayMinutes}))`;

/**
 * 返信の段階を1回行う。1件の失敗で全体を止めない。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now この回の時刻
 * @returns 出した・出せなかった・待った数
 */
export async function runMentionStage(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date,
): Promise<MentionStageResult> {
  const { db, logger } = deps;
  const result: MentionStageResult = { sent: 0, failed: 0, waiting: 0 };
  const leaseToken = randomUUID();
  // 対象を読み、借りる（同じ行を2つの回で同時に扱わない）。投稿の前は投稿した日時が null なので、時刻も決まらず対象にならない
  const due = await db
    .select({ draftId: threadsPostMention.draftId })
    .from(threadsPostMention)
    .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMention.draftId))
    .where(
      and(
        eq(threadsPostMention.state, "pending"),
        or(isNull(threadsPostMention.leaseUntil), lt(threadsPostMention.leaseUntil, now)),
        or(isNull(threadsPostMention.nextAttemptAt), lt(threadsPostMention.nextAttemptAt, now)),
        sql`${dueAtSql} <= ${now}`,
      ),
    )
    .orderBy(dueAtSql)
    .limit(MENTION_MAX_PER_TICK);
  for (const { draftId } of due) {
    const [leased] = await db
      .update(threadsPostMention)
      .set({ leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(
        and(
          eq(threadsPostMention.draftId, draftId),
          eq(threadsPostMention.state, "pending"),
          or(isNull(threadsPostMention.leaseUntil), lt(threadsPostMention.leaseUntil, now)),
        ),
      )
      .returning();
    if (!leased) continue;
    try {
      result[await handleOne(deps, threads, leased, leaseToken, now)] += 1;
    } catch (error) {
      logger.error(
        { draftId, errorName: (error as Error).name },
        "時間差のメンション：返信の途中で予期しないエラー",
      );
      await release(deps, draftId, leaseToken);
      result.waiting += 1;
    }
  }
  if (result.sent > 0 || result.failed > 0)
    logger.info({ sent: result.sent, failed: result.failed }, "時間差のメンション");
  return result;
}

/**
 * 借りを返す（待つ）。
 * @param deps 土台が渡す道具
 * @param draftId 案の ID
 * @param leaseToken この回の借り
 */
async function release(deps: DomainRouteDeps, draftId: string, leaseToken: string): Promise<void> {
  await deps.db
    .update(threadsPostMention)
    .set({ leaseToken: null, leaseUntil: null })
    .where(
      and(eq(threadsPostMention.draftId, draftId), eq(threadsPostMention.leaseToken, leaseToken)),
    );
}

/**
 * 出せなかったことにする。
 * @param deps 土台が渡す道具
 * @param draftId 案の ID
 * @param leaseToken この回の借り
 * @param reason 理由
 * @returns "failed"
 */
async function fail(
  deps: DomainRouteDeps,
  draftId: string,
  leaseToken: string,
  reason: MentionFailureReason,
): Promise<"failed"> {
  await deps.db
    .update(threadsPostMention)
    .set({ state: "failed", failureReason: reason, leaseToken: null, leaseUntil: null })
    .where(
      and(eq(threadsPostMention.draftId, draftId), eq(threadsPostMention.leaseToken, leaseToken)),
    );
  return "failed";
}

/**
 * 出したことにする。
 * @param deps 土台が渡す道具
 * @param draftId 案の ID
 * @param leaseToken この回の借り
 * @param mediaId 返信の ID（わからなければ null）
 * @param now 今
 * @returns "sent"
 */
async function markSent(
  deps: DomainRouteDeps,
  draftId: string,
  leaseToken: string,
  mediaId: string | null,
  now: Date,
): Promise<"sent"> {
  await deps.db
    .update(threadsPostMention)
    .set({ state: "sent", sentAt: now, replyMediaId: mediaId, leaseToken: null, leaseUntil: null })
    .where(
      and(eq(threadsPostMention.draftId, draftId), eq(threadsPostMention.leaseToken, leaseToken)),
    );
  return "sent";
}

/**
 * 1件を扱う（出す前の確かめ → 出す）。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param m 借りた行
 * @param leaseToken この回の借り
 * @param now 今
 * @returns 結果
 */
async function handleOne(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  m: MentionRow,
  leaseToken: string,
  now: Date,
): Promise<"sent" | "failed" | "waiting"> {
  const { db } = deps;
  const [row] = await db
    .select({
      status: threadsPostDraft.status,
      threadsMediaId: threadsPostDraft.threadsMediaId,
      publishedAt: threadsPostDraft.publishedAt,
      repliesDeniedAt: threadsAccount.repliesDeniedAt,
    })
    .from(threadsPostDraft)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsPostDraft.threadsAccountId))
    .where(eq(threadsPostDraft.id, m.draftId));
  if (!row || row.status !== "published" || !row.threadsMediaId)
    return fail(deps, m.draftId, leaseToken, "post_failed");
  // 期限は返信の時刻から数える。結果のわからない公開の途中なら、時間を過ぎても確かめる（二重に出さない）
  const start = mentionDueAt(
    { delayMinutes: m.delayMinutes, sendAfter: m.sendAfter },
    row.publishedAt,
  );
  if (
    !m.publishRequestedAt &&
    start &&
    now.getTime() - start.getTime() > MENTION_EXPIRE_HOURS * HOUR_MS
  )
    return fail(deps, m.draftId, leaseToken, "expired");
  if (row.repliesDeniedAt && !m.publishRequestedAt)
    return fail(deps, m.draftId, leaseToken, "no_permission");
  const cred = await loadCredentials(db, deps.secretBox, m.threadsAccountId, deps.logger);
  if (
    !cred ||
    cred.connectionStatus !== "connected" ||
    !cred.token ||
    cred.threadsUserId === null
  ) {
    await release(deps, m.draftId, leaseToken);
    return "waiting";
  }
  if (!m.publishRequestedAt) {
    // 出す直前の NG ワード
    if (findNgWords(m.text, await listNgWords(db, m.threadsAccountId)).length > 0)
      return fail(deps, m.draftId, leaseToken, "ng_word");
    // 同じ人は24時間に1回まで。当たれば文を書き換えずに出さない
    const since = new Date(now.getTime() - MENTION_SAME_PERSON_HOURS * HOUR_MS);
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(threadsPostMention)
      .where(
        and(
          eq(threadsPostMention.threadsAccountId, m.threadsAccountId),
          ne(threadsPostMention.draftId, m.draftId),
          eq(threadsPostMention.state, "sent"),
          sql`${threadsPostMention.sentAt} > ${since}`,
          sql`${threadsPostMention.usernames} && ${sql.param(m.usernames)}::text[]`,
        ),
      );
    if ((recent?.n ?? 0) > 0) return fail(deps, m.draftId, leaseToken, "limit");
  }

  const token = cred.token;
  const userId = cred.threadsUserId;
  // どこで失敗したか（返信のもとを作るところの 4xx は、返信先が見つからない）
  let stage: "status" | "create" | "publish" = "status";
  try {
    let containerId = m.containerId;
    if (m.publishRequestedAt && containerId) {
      // 前の回で公開を送ったが、結果がわからない。状態を確かめる
      const { status } = await threads.getContainerStatus(token, containerId);
      if (status === "PUBLISHED") return markSent(deps, m.draftId, leaseToken, null, now);
      if (status === "ERROR" || status === "EXPIRED") {
        await db
          .update(threadsPostMention)
          .set({ containerId: null, publishRequestedAt: null })
          .where(
            and(
              eq(threadsPostMention.draftId, m.draftId),
              eq(threadsPostMention.leaseToken, leaseToken),
            ),
          );
        containerId = null;
      }
      if (status === "IN_PROGRESS" || status === "FINISHED") {
        // 処理中のまま時間を過ぎたら、出せなかったことにする（いつまでも借り直さない）
        if (now.getTime() - m.publishRequestedAt.getTime() > MENTION_EXPIRE_HOURS * HOUR_MS)
          return fail(deps, m.draftId, leaseToken, "error");
        await release(deps, m.draftId, leaseToken);
        return "waiting";
      }
    }
    if (!containerId) {
      stage = "create";
      ({ containerId } = await threads.createTextContainer(token, userId, m.text, {
        replyToId: row.threadsMediaId,
      }));
      await db
        .update(threadsPostMention)
        .set({ containerId })
        .where(
          and(
            eq(threadsPostMention.draftId, m.draftId),
            eq(threadsPostMention.leaseToken, leaseToken),
          ),
        );
    }
    stage = "publish";
    // 公開を送る前に、まだ予定のままかを確かめる（「やめる」・人の削除で取りやめたら送らない）
    const [still] = await db
      .update(threadsPostMention)
      .set({ publishRequestedAt: now })
      .where(
        and(
          eq(threadsPostMention.draftId, m.draftId),
          eq(threadsPostMention.leaseToken, leaseToken),
          eq(threadsPostMention.state, "pending"),
        ),
      )
      .returning({ draftId: threadsPostMention.draftId });
    if (!still) return "waiting";
    const { mediaId } = await threads.publishContainer(token, userId, containerId);
    return markSent(deps, m.draftId, leaseToken, mediaId, now);
  } catch (error) {
    if (error instanceof ThreadsAuthError) {
      await markNeedsReconnect(db, m.threadsAccountId, cred.generation);
      await release(deps, m.draftId, leaseToken);
      return "waiting";
    }
    if (error instanceof ThreadsPermissionError) {
      await db
        .update(threadsAccount)
        .set({ repliesDeniedAt: now })
        .where(eq(threadsAccount.id, m.threadsAccountId));
      return fail(deps, m.draftId, leaseToken, "no_permission");
    }
    if (
      error instanceof ThreadsTransientError ||
      error instanceof ThreadsRateLimitError ||
      !(error instanceof ThreadsApiError)
    ) {
      // 一時的な失敗。公開を送ったあとなら、次の回に確かめる（やり直しの回数に数えない）
      const [current] = await db
        .select({ publishRequestedAt: threadsPostMention.publishRequestedAt })
        .from(threadsPostMention)
        .where(eq(threadsPostMention.draftId, m.draftId));
      if (current?.publishRequestedAt) {
        await release(deps, m.draftId, leaseToken);
        return "waiting";
      }
      const attempts = m.attempts + 1;
      if (attempts >= MENTION_MAX_ATTEMPTS) return fail(deps, m.draftId, leaseToken, "error");
      await db
        .update(threadsPostMention)
        .set({
          attempts,
          nextAttemptAt: new Date(now.getTime() + RETRY_STEP_MS * attempts),
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(threadsPostMention.draftId, m.draftId),
            eq(threadsPostMention.leaseToken, leaseToken),
          ),
        );
      return "waiting";
    }
    // 確かな失敗（4xx）。返信先の投稿が見つからない・受け付けられない
    return fail(deps, m.draftId, leaseToken, stage === "create" ? "not_found" : "error");
  }
}
