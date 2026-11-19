// 自動投稿の状態・予定・知らせ（threads-002。めぐるの publish/auto-post-status.ts を写した）。
// 知らせは保存せず、読むたびに今の状態から決める。
import { addDays, jstDateOf, jstMidnight, projectSchedule } from "@workspace/contracts/threads";
import type { AutoPostNotice, AutoPostStatus, PublishError } from "@workspace/contracts/threads";
import { and, count, desc, eq, gt, gte, isNotNull, lt } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { countDrafts, listQueue } from "./repository.ts";
import type { PostDraftRecord, ThreadsAccountRecord } from "./repository.ts";
import { readPostingSchedule, toAutoPostState } from "./posting-schedule.ts";
import type { PostingScheduleRow } from "./posting-schedule.ts";
import { threadsPostDraft, threadsPublishAttempt } from "./schema.ts";

/**
 * 予定の計算の材料を読む：今日・昨日に試みの行がある予定の時刻と、今日の投稿済みの数。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 使った時刻と、今日の投稿済みの数
 */
async function readScheduleUsage(db: Executor, threadsAccountId: string, now: Date) {
  const today = jstDateOf(now);
  const [used, [published]] = await Promise.all([
    db
      .select({ slotAt: threadsPublishAttempt.slotAt })
      .from(threadsPublishAttempt)
      .where(
        and(
          eq(threadsPublishAttempt.threadsAccountId, threadsAccountId),
          gte(threadsPublishAttempt.slotDate, addDays(today, -1)),
        ),
      ),
    db
      .select({ n: count() })
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          eq(threadsPostDraft.status, "published"),
          gte(threadsPostDraft.publishedAt, jstMidnight(today)),
          lt(threadsPostDraft.publishedAt, jstMidnight(addDays(today, 1))),
        ),
      ),
  ]);
  return { usedSlotTimes: used.map((row) => row.slotAt), publishedToday: published?.n ?? 0 };
}

/**
 * これから先の予定の時刻。止まっている（未接続・接続し直し・上限）・オフのときは空。
 * @param db DB
 * @param account 運用アカウント
 * @param schedule 投稿の設定
 * @param now 今
 * @param n 求める数
 * @returns 予定の時刻（早い順）
 */
export async function upcomingSlots(
  db: Executor,
  account: ThreadsAccountRecord,
  schedule: PostingScheduleRow | null,
  now: Date,
  n: number,
): Promise<Date[]> {
  if (!schedule?.enabled || toAutoPostState(account.connectionStatus, schedule, now).stoppedReason)
    return [];
  const usage = await readScheduleUsage(db, account.id, now);
  return projectSchedule({
    accountId: account.id,
    enabled: schedule.enabled,
    slotMinutes: schedule.slotMinutes,
    jitter: schedule.jitter,
    effectiveFrom: schedule.effectiveFrom,
    pausedUntil: schedule.pausedUntil,
    now,
    ...usage,
    count: n,
  });
}

/**
 * 承認済みの案ごとの、投稿の予定の時刻（投稿中の案と、予定がない案は入れない）。
 * @param db DB
 * @param account 運用アカウント
 * @param queue 投稿の順の案（投稿中を含んでよい）
 * @param now 今
 * @returns 案の ID から予定の時刻（ISO 8601）へ
 */
export async function queueSchedule(
  db: Executor,
  account: ThreadsAccountRecord,
  queue: readonly PostDraftRecord[],
  now: Date,
): Promise<Record<string, string>> {
  const waiting = queue.filter((draft) => draft.status === "approved");
  if (waiting.length === 0) return {};
  const schedule = await readPostingSchedule(db, account.id);
  const slots = await upcomingSlots(db, account, schedule, now, waiting.length);
  const result: Record<string, string> = {};
  slots.forEach((at, index) => {
    const draft = waiting[index];
    if (draft) result[draft.id] = at.toISOString();
  });
  return result;
}

/**
 * 自動投稿の状態・次の投稿・知らせ。
 * @param db DB
 * @param account 運用アカウント
 * @param now 今
 * @returns 自動投稿の状態
 */
export async function getAutoPostStatus(
  db: Executor,
  account: ThreadsAccountRecord,
  now: Date = new Date(),
): Promise<AutoPostStatus> {
  const [schedule, counts] = await Promise.all([
    readPostingSchedule(db, account.id),
    countDrafts(db, account.id),
  ]);
  const autoPost = toAutoPostState(account.connectionStatus, schedule, now);
  const notices: AutoPostNotice[] = [];
  // 未接続なら、承認した案はつないでオンにすると投稿される、と知らせる
  if (account.connectionStatus === "not_connected") notices.push({ kind: "not_connected" });
  if (account.connectionStatus === "needs_reconnect") notices.push({ kind: "needs_reconnect" });
  if (autoPost.stoppedReason === "rate_limited" && schedule?.pausedUntil) {
    notices.push({ kind: "rate_limited", until: schedule.pausedUntil.toISOString() });
  }
  const [failed] = await db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, account.id),
        eq(threadsPostDraft.status, "publish_failed"),
      ),
    )
    .orderBy(desc(threadsPostDraft.publishFailedAt), desc(threadsPostDraft.id))
    .limit(1);
  if (failed?.publishFailedAt && counts.publish_failed > 0) {
    notices.push({
      kind: "publish_failed",
      count: counts.publish_failed,
      latestError: (failed.publishError as PublishError | null) ?? "unknown",
      latestAt: failed.publishFailedAt.toISOString(),
    });
  }
  const blocked = await db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, account.id),
        eq(threadsPostDraft.status, "needs_review"),
        isNotNull(threadsPostDraft.blockedAt),
        schedule?.blockedNoticeSeenAt
          ? gt(threadsPostDraft.blockedAt, schedule.blockedNoticeSeenAt)
          : undefined,
      ),
    )
    .orderBy(desc(threadsPostDraft.blockedAt), desc(threadsPostDraft.id));
  const latestBlocked = blocked[0];
  if (latestBlocked?.blockedReason) {
    notices.push({
      kind: "blocked",
      count: blocked.length,
      latestReason: latestBlocked.blockedReason === "ng_word" ? "ng_word" : "over_threads_limit",
      latestWords: latestBlocked.blockedWords ?? [],
    });
  }
  const [nextAt] = await upcomingSlots(db, account, schedule, now, 1);
  if (autoPost.enabled && autoPost.stoppedReason === null && counts.approved === 0) {
    notices.push({ kind: "no_approved", nextSlotAt: nextAt?.toISOString() ?? null });
  }
  const queue = await listQueue(db, account.id, { includePublishing: false });
  const draft = queue[0];
  return {
    autoPost,
    next:
      nextAt && draft
        ? {
            at: nextAt.toISOString(),
            draft: { id: draft.id, excerpt: Array.from(draft.body).slice(0, 40).join("") },
          }
        : null,
    approvedCount: counts.approved,
    daysLeft: autoPost.slotCount ? Math.floor(counts.approved / autoPost.slotCount) : null,
    notices,
  };
}
