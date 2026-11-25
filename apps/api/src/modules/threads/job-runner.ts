// 定期の仕事（threads-002。めぐるの publish/auto-post-runner.ts と日次の片付けを写した）。
// 共通の定期の仕事の窓口（core-017）が5分おき（日本時間 8時〜23時台。DB の夜間の停止の外）に scheduledJob として動かし、1回で次を行う（PRD B9）：
//   1. 続きの処理（結果を確かめる途中・やり直し待ち）
//   2. 来ている時刻の試みを作り、公開する（1回で進める公開は AUTOPOST_MAX_PER_TICK まで）
//   2b. 時間差のメンションの返信（threads-007。1回 MENTION_MAX_PER_TICK 件まで）
//   3. 投稿の URL の取り直し
//   4. 期限を確かめられなかったトークンの確かめ直し・期限の近いトークンの延長
//   5. 反応の取りこみと判定（threads-003）
//   6. 片付け（古い試み・過ぎた停止・古い確かめの失敗・90日を過ぎた操作の記録・止まったデータの削除のやり直しと切れた OAuth の state）
// めぐるの「関所」（用のない回は DB に触れない）は持たない：Cloud Run と Cloud Scheduler の回数は無料の枠に収まり、読みは軽い。
// 1件・1つの運用アカウントの失敗で全体を止めない。ログは ID と数だけ（本文・トークンを出さない）。
import {
  AUTOPOST_ATTEMPT_RETENTION_DAYS,
  AUTOPOST_LATE_WARN_MINUTES,
  AUTOPOST_LEASE_SECONDS,
  AUTOPOST_MAX_PER_TICK,
  AUTOPOST_PERMALINK_RETRY_MINUTES,
  addDays,
  findDueSlot,
  jstDateOf,
} from "@workspace/contracts/threads";
import type { DueSlot, JobRunSummary } from "@workspace/contracts/threads";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import {
  loadCredentials,
  purgeTokenCheckFailures,
  refreshExpiringTokens,
  runTokenRecheck,
} from "./connection.ts";
import { purgeActivity } from "./activity-log.ts";
import { runOauthMaintenance } from "./oauth.ts";
import { runMentionStage } from "./mention-runner.ts";
import { runMetricsStage } from "./metrics-runner.ts";
import { claimSlot } from "./publish-claim.ts";
import { executeAttempt, fillPermalink } from "./publish-executor.ts";
import type { ExecuteOutcome } from "./publish-executor.ts";
import {
  threadsAccount,
  threadsPostDraft,
  threadsPostingSchedule,
  threadsPublishAttempt,
} from "./schema.ts";
import type { ThreadsClient } from "./threads-client.ts";

/** 定期の仕事の1回の結果。 */
export type { JobRunSummary };

/**
 * 空の結果。
 * @returns 結果
 */
function emptySummary(): JobRunSummary {
  return {
    published: 0,
    retried: 0,
    carriedOver: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    deferred: 0,
    waiting: 0,
    rechecked: 0,
    refreshed: 0,
    metrics: 0,
    mentions: 0,
  };
}

/**
 * 続きの処理の対象：持ち時間の切れた処理中、時刻の来たやり直し待ち。
 * @param now 基準の時刻
 * @returns 条件
 */
function continuable(now: Date) {
  return or(
    and(
      eq(threadsPublishAttempt.state, "in_progress"),
      or(isNull(threadsPublishAttempt.leaseUntil), lt(threadsPublishAttempt.leaseUntil, now)),
    ),
    and(eq(threadsPublishAttempt.state, "retry_wait"), lte(threadsPublishAttempt.nextRetryAt, now)),
  );
}

/**
 * 定期の仕事を1回行う。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now 基準の時刻（回の実際の始まり）
 * @param clock 実際の時刻（投稿の日時の記録に使う。テストで差しかえる）
 * @returns この回の結果
 */
export async function runJob(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date = new Date(),
  clock: () => Date = () => new Date(),
): Promise<JobRunSummary> {
  const { db, logger } = deps;
  const summary = emptySummary();
  let budget = AUTOPOST_MAX_PER_TICK;
  const publishedNow: string[] = [];

  /**
   * 結果を数える。
   * @param outcome 結果
   */
  const tally = (outcome: ExecuteOutcome) => {
    if (outcome.kind === "published") {
      summary.published += 1;
      publishedNow.push(outcome.draftId);
      const lag = Math.round((now.getTime() - outcome.slotAt.getTime()) / 60_000);
      if (lag > AUTOPOST_LATE_WARN_MINUTES)
        logger.warn({ lagMinutes: lag }, "自動投稿：予定より遅れて投稿しました");
    } else if (outcome.kind === "retry") summary.retried += 1;
    else if (outcome.kind === "carried_over") summary.carriedOver += 1;
    else if (outcome.kind === "failed") summary.failed += 1;
    else if (outcome.kind === "skipped" && outcome.reason === "blocked") summary.blocked += 1;
    else if (outcome.kind === "skipped") summary.skipped += 1;
    else summary.waiting += 1;
  };
  /**
   * 試みを進める（予期しない失敗は、持ち時間が切れたあとに次の回で拾う）。
   * @param attemptId 試みの ID
   * @param leaseToken 札
   */
  const execute = async (attemptId: string, leaseToken: string) => {
    try {
      tally(await executeAttempt(deps, threads, attemptId, leaseToken, now, clock));
    } catch (error) {
      logger.error(
        { attemptId, errorName: (error as Error).name },
        "自動投稿：試みの途中で予期しないエラー",
      );
      summary.waiting += 1;
    }
  };

  // 1. 続きの処理（前に確かめたのが古い順。同じ試みばかりを選ばない）
  const pending = await db
    .select({ id: threadsPublishAttempt.id })
    .from(threadsPublishAttempt)
    .where(continuable(now))
    .orderBy(
      sql`${threadsPublishAttempt.leaseUntil} ASC NULLS FIRST`,
      asc(threadsPublishAttempt.slotAt),
    );
  for (const attempt of pending) {
    if (budget <= 0) {
      summary.deferred += 1;
      continue;
    }
    // 新しい札で取る。前に持っていた古い処理は、以後の更新ができなくなる
    const leaseToken = randomUUID();
    const [got] = await db
      .update(threadsPublishAttempt)
      .set({
        state: "in_progress",
        leaseUntil: new Date(now.getTime() + AUTOPOST_LEASE_SECONDS * 1000),
        leaseToken,
        updatedAt: now,
      })
      .where(and(eq(threadsPublishAttempt.id, attempt.id), continuable(now)))
      .returning({ id: threadsPublishAttempt.id });
    if (!got) continue;
    budget -= 1;
    await execute(attempt.id, leaseToken);
  }

  // 2. 時刻の処理（未接続の運用アカウントは見ない。試みも作らない）
  const schedules = await db
    .select({ schedule: threadsPostingSchedule })
    .from(threadsPostingSchedule)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsPostingSchedule.threadsAccountId))
    .where(
      and(
        eq(threadsPostingSchedule.enabled, true),
        ne(threadsAccount.connectionStatus, "not_connected"),
      ),
    );
  const accountIds = schedules.map((row) => row.schedule.threadsAccountId);
  const recent = accountIds.length
    ? await db
        .select({
          threadsAccountId: threadsPublishAttempt.threadsAccountId,
          slotAt: threadsPublishAttempt.slotAt,
        })
        .from(threadsPublishAttempt)
        .where(
          and(
            inArray(threadsPublishAttempt.threadsAccountId, accountIds),
            gte(threadsPublishAttempt.slotDate, addDays(jstDateOf(now), -2)),
          ),
        )
    : [];
  const used = new Set(recent.map((row) => `${row.threadsAccountId}:${row.slotAt.getTime()}`));
  const due: { threadsAccountId: string; slot: DueSlot }[] = [];
  for (const { schedule } of schedules) {
    const slot = findDueSlot({
      accountId: schedule.threadsAccountId,
      slotMinutes: schedule.slotMinutes,
      jitter: schedule.jitter,
      effectiveFrom: schedule.effectiveFrom,
      now,
    });
    if (slot && !used.has(`${schedule.threadsAccountId}:${slot.slotAt.getTime()}`)) {
      due.push({ threadsAccountId: schedule.threadsAccountId, slot });
    }
  }
  due.sort((a, b) => a.slot.slotAt.getTime() - b.slot.slotAt.getTime());
  for (const item of due) {
    if (budget <= 0) {
      summary.deferred += 1;
      continue;
    }
    try {
      const result = await claimSlot(db, item.threadsAccountId, item.slot, now);
      if (result.kind === "skipped") {
        summary.skipped += 1;
        summary.blocked += result.blocked;
      } else if (result.kind === "claimed") {
        summary.blocked += result.blocked;
        budget -= 1;
        await execute(result.attemptId, result.leaseToken);
      }
    } catch (error) {
      summary.deferred += 1;
      logger.error(
        { threadsAccountId: item.threadsAccountId, errorName: (error as Error).name },
        "自動投稿：時刻の試みを作れませんでした",
      );
    }
  }

  // 2b. 時間差のメンションの返信（threads-007。失敗しても投稿の結果に響かせない）
  try {
    summary.mentions = (await runMentionStage(deps, threads, now)).sent;
  } catch (error) {
    logger.error({ errorName: (error as Error).name }, "時間差のメンションの返信に失敗しました");
  }

  // 3. 投稿の URL の取り直し（余裕があるときだけ）
  if (budget > 0) await refillPermalinks(deps, threads, now, publishedNow);

  // 4. トークンの確かめ直しと延長（失敗しても投稿の結果に響かせない）
  try {
    summary.rechecked = await runTokenRecheck(deps, threads, now);
    summary.refreshed = await refreshExpiringTokens(deps, threads, now);
  } catch (error) {
    logger.error({ errorName: (error as Error).name }, "トークンの確かめ直し・延長に失敗しました");
  }

  // 5. 反応の取りこみと判定（threads-003。失敗しても投稿の結果に響かせない）
  try {
    summary.metrics = await runMetricsStage(deps, threads, now, AUTOPOST_MAX_PER_TICK - budget);
  } catch (error) {
    logger.error({ errorName: (error as Error).name }, "反応の取りこみに失敗しました");
  }

  // 6. 片付け
  try {
    await cleanup(deps, now);
  } catch (error) {
    logger.error({ errorName: (error as Error).name }, "定期の片付けに失敗しました");
  }

  logger.info({ ...summary }, "Threads の定期の仕事");
  return summary;
}

/**
 * URL の空いた投稿済み（7日以内）を、最大2件取り直す。失敗したら permalink_checked_at を入れ、しばらく選ばない。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now 今
 * @param exclude この回に公開した案（公開の直後に一度試しているので選ばない）
 */
async function refillPermalinks(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date,
  exclude: string[],
): Promise<void> {
  const retryBefore = new Date(now.getTime() - AUTOPOST_PERMALINK_RETRY_MINUTES * 60_000);
  const rows = await deps.db
    .select({
      id: threadsPostDraft.id,
      threadsAccountId: threadsPostDraft.threadsAccountId,
      mediaId: threadsPostDraft.threadsMediaId,
    })
    .from(threadsPostDraft)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsPostDraft.threadsAccountId))
    .where(
      and(
        eq(threadsPostDraft.status, "published"),
        isNull(threadsPostDraft.threadsPermalink),
        isNotNull(threadsPostDraft.threadsMediaId),
        gte(threadsPostDraft.publishedAt, new Date(now.getTime() - 7 * 86_400_000)),
        eq(threadsAccount.connectionStatus, "connected"),
        or(
          isNull(threadsPostDraft.permalinkCheckedAt),
          lt(threadsPostDraft.permalinkCheckedAt, retryBefore),
        ),
        exclude.length > 0 ? notInArray(threadsPostDraft.id, exclude) : undefined,
      ),
    )
    .orderBy(
      sql`${threadsPostDraft.permalinkCheckedAt} ASC NULLS FIRST`,
      desc(threadsPostDraft.publishedAt),
    )
    .limit(2);
  for (const row of rows) {
    if (!row.mediaId) continue;
    const cred = await loadCredentials(deps.db, deps.secretBox, row.threadsAccountId, deps.logger);
    const ok = cred?.token
      ? await fillPermalink(deps, threads, cred.token, row.id, row.mediaId)
      : false;
    if (!ok) {
      await deps.db
        .update(threadsPostDraft)
        .set({ permalinkCheckedAt: now })
        .where(eq(threadsPostDraft.id, row.id));
    }
  }
}

/**
 * 片付け：保存の日数を過ぎた試み（処理中・やり直し待ち・持ち越しで参照中のものは残す）・過ぎた停止・1日より前の確かめの失敗。
 * @param deps 土台が渡す道具
 * @param now 今
 */
async function cleanup(deps: DomainRouteDeps, now: Date): Promise<void> {
  const { db } = deps;
  await db
    .delete(threadsPublishAttempt)
    .where(
      and(
        lt(
          threadsPublishAttempt.slotDate,
          addDays(jstDateOf(now), -AUTOPOST_ATTEMPT_RETENTION_DAYS),
        ),
        notInArray(threadsPublishAttempt.state, ["in_progress", "retry_wait"]),
        notExists(
          db
            .select({ id: threadsPostDraft.id })
            .from(threadsPostDraft)
            .where(eq(threadsPostDraft.carryoverAttemptId, threadsPublishAttempt.id)),
        ),
      ),
    );
  await db
    .update(threadsPostingSchedule)
    .set({ pausedUntil: null })
    .where(
      and(
        isNotNull(threadsPostingSchedule.pausedUntil),
        lt(threadsPostingSchedule.pausedUntil, now),
      ),
    );
  await purgeTokenCheckFailures(db, now);
  await purgeActivity(db, now);
  // 止まった Meta のデータの削除のやり直しと、切れた OAuth の state（threads-010）
  await runOauthMaintenance(deps, now);
}
