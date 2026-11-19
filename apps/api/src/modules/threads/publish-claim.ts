// 取り出し（threads-002。めぐるの publish/publish-claim.ts を写した）。
// 来ている時刻の試みの行を作り、同じトランザクションで、公開する案を選んで投稿中にする。
// 投稿の順の先頭から、その時点の NG ワードと Threads の上限で確かめ直し、当たった案は承認待ちに戻して理由を残す。
// 同じ時刻を二重に処理しない（運用アカウントと予定の日時の一意の制約・運用アカウントごとの鍵）。
import {
  AUTOPOST_DAILY_API_LIMIT,
  AUTOPOST_LEASE_SECONDS,
  addDays,
  checkPublishable,
  jstMidnight,
  plannedSlotTime,
} from "@workspace/contracts/threads";
import type { DueSlot } from "@workspace/contracts/threads";
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db, Executor } from "../../kernel/db.ts";
import { lockKey } from "./locks.ts";
import { listNgWords, listQueue } from "./repository.ts";
import {
  threadsAccount,
  threadsPostDraft,
  threadsPostingSchedule,
  threadsPublishAttempt,
} from "./schema.ts";

/** 投稿の設定の行。 */
type ScheduleRow = typeof threadsPostingSchedule.$inferSelect;

/** 飛ばした理由。 */
export type SkipReason =
  "no_drafts" | "needs_reconnect" | "rate_limited" | "daily_limit" | "auto_post_off";

/** 取り出しの結果。 */
export type ClaimResult =
  | { kind: "exists" }
  | { kind: "waiting" }
  | { kind: "stale" }
  | { kind: "skipped"; attemptId: string; reason: SkipReason; blocked: number }
  | { kind: "claimed"; attemptId: string; draftId: string; leaseToken: string; blocked: number };

/**
 * 時刻が、今の設定の時刻のままかを確かめる（定期の仕事が設定を読んだあとに、設定の変更・つなぎ直しで変わっていれば false）。
 * @param threadsAccountId 運用アカウントの ID
 * @param slot 来ている時刻
 * @param schedule 取り出しのトランザクションで読み直した設定
 * @returns 今の設定でも予定の時刻なら true
 */
function isCurrentSlot(threadsAccountId: string, slot: DueSlot, schedule: ScheduleRow): boolean {
  return (
    slot.slotAt.getTime() > schedule.effectiveFrom.getTime() &&
    schedule.slotMinutes.includes(slot.slotMinute) &&
    plannedSlotTime(threadsAccountId, slot.slotDate, slot.slotMinute, schedule.jitter).getTime() ===
      slot.slotAt.getTime()
  );
}

/**
 * 公開してよいかの条件を確かめる。満たさなければ飛ばす理由を返す。
 * @param tx トランザクション
 * @param threadsAccountId 運用アカウントの ID
 * @param schedule 読み直した設定
 * @param slot 来ている時刻
 * @param now 今
 * @returns 飛ばす理由。満たしていれば null
 */
async function skipReasonOf(
  tx: Executor,
  threadsAccountId: string,
  schedule: ScheduleRow | undefined,
  slot: DueSlot,
  now: Date,
): Promise<SkipReason | null> {
  const [account] = await tx
    .select({ connectionStatus: threadsAccount.connectionStatus })
    .from(threadsAccount)
    .where(eq(threadsAccount.id, threadsAccountId));
  if (!schedule?.enabled) return "auto_post_off";
  if (account?.connectionStatus !== "connected") return "needs_reconnect";
  if (schedule.pausedUntil && schedule.pausedUntil.getTime() > now.getTime()) return "rate_limited";
  const published = (from: Date, to: Date) =>
    tx
      .select({ n: count() })
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          eq(threadsPostDraft.status, "published"),
          gte(threadsPostDraft.publishedAt, from),
          lt(threadsPostDraft.publishedAt, to),
        ),
      );
  const [[day], [last24h]] = await Promise.all([
    published(jstMidnight(slot.slotDate), jstMidnight(addDays(slot.slotDate, 1))),
    published(new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 1)),
  ]);
  // その日の投稿は時刻の数まで。24時間で Threads の上限（250件）を超えない
  if ((day?.n ?? 0) >= schedule.slotMinutes.length) return "daily_limit";
  if ((last24h?.n ?? 0) >= AUTOPOST_DAILY_API_LIMIT) return "rate_limited";
  return null;
}

/**
 * 来ている時刻の試みを作り、公開する案を選ぶ。
 * - 同じ時刻の行がもうあれば何もしない
 * - 同じ運用アカウントに処理中・やり直し待ちの試みがあれば、行を作らずに待つ（1つずつ進める）
 * - 設定を読み直し、時刻が今の設定のものでなくなっていれば、行を作らずに終える
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param slot 来ている時刻
 * @param now 今
 * @returns exists・waiting・stale・skipped（理由）・claimed（案）。blocked は承認待ちに戻した数
 */
export async function claimSlot(
  db: Db,
  threadsAccountId: string,
  slot: DueSlot,
  now: Date,
): Promise<ClaimResult> {
  return db.transaction(async (tx): Promise<ClaimResult> => {
    await lockKey(tx, `threads_post_draft:${threadsAccountId}`);
    const [existing] = await tx
      .select({ id: threadsPublishAttempt.id })
      .from(threadsPublishAttempt)
      .where(
        and(
          eq(threadsPublishAttempt.threadsAccountId, threadsAccountId),
          eq(threadsPublishAttempt.slotAt, slot.slotAt),
        ),
      )
      .limit(1);
    if (existing) return { kind: "exists" };
    const [pending] = await tx
      .select({ id: threadsPublishAttempt.id })
      .from(threadsPublishAttempt)
      .where(
        and(
          eq(threadsPublishAttempt.threadsAccountId, threadsAccountId),
          inArray(threadsPublishAttempt.state, ["in_progress", "retry_wait"]),
        ),
      )
      .limit(1);
    if (pending) return { kind: "waiting" };
    // 設定を共有の鍵で読み直す（設定の変更・つなぎ直しは、この取り出しの前か後のどちらかになる）
    const [schedule] = await tx
      .select()
      .from(threadsPostingSchedule)
      .where(eq(threadsPostingSchedule.threadsAccountId, threadsAccountId))
      .for("share");
    if (schedule?.enabled && !isCurrentSlot(threadsAccountId, slot, schedule))
      return { kind: "stale" };

    const base = {
      threadsAccountId,
      slotAt: slot.slotAt,
      slotDate: slot.slotDate,
      slotMinute: slot.slotMinute,
      createdAt: now,
      updatedAt: now,
    };
    const skip = async (reason: SkipReason, blocked: number): Promise<ClaimResult> => {
      const [row] = await tx
        .insert(threadsPublishAttempt)
        .values({ ...base, state: "skipped", skipReason: reason })
        .returning({ id: threadsPublishAttempt.id });
      if (!row) throw new Error("投稿の試みを作れませんでした。");
      return { kind: "skipped", attemptId: row.id, reason, blocked };
    };
    const reason = await skipReasonOf(tx, threadsAccountId, schedule, slot, now);
    if (reason) return skip(reason, 0);

    const [queue, ngWords] = await Promise.all([
      listQueue(tx, threadsAccountId, { includePublishing: false }),
      listNgWords(tx, threadsAccountId),
    ]);
    let blocked = 0;
    for (const draft of queue) {
      const check = checkPublishable(draft.body, ngWords);
      if (!check.approvable) {
        // 投稿の直前の確かめで当たった：承認待ちに戻し、理由を残す（承認待ちの上限は確かめない）
        await tx
          .update(threadsPostDraft)
          .set({
            status: "needs_review",
            reviewedAt: null,
            prioritizedAt: null,
            carryoverAttemptId: null,
            blockedAt: now,
            blockedReason: check.ngWords.length > 0 ? "ng_word" : "over_threads_limit",
            blockedWords:
              check.ngWords.length > 0 ? [...new Set(check.ngWords.map((hit) => hit.word))] : null,
            version: sql`${threadsPostDraft.version} + 1`,
          })
          .where(eq(threadsPostDraft.id, draft.id));
        blocked += 1;
        continue;
      }
      const leaseToken = randomUUID();
      const [row] = await tx
        .insert(threadsPublishAttempt)
        .values({
          ...base,
          state: "in_progress",
          draftId: draft.id,
          isCarryover: draft.carryoverAttemptId !== null,
          leaseUntil: new Date(now.getTime() + AUTOPOST_LEASE_SECONDS * 1000),
          leaseToken,
        })
        .returning({ id: threadsPublishAttempt.id });
      if (!row) throw new Error("投稿の試みを作れませんでした。");
      await tx
        .update(threadsPostDraft)
        .set({
          status: "publishing",
          carryoverAttemptId: null,
          version: sql`${threadsPostDraft.version} + 1`,
        })
        .where(eq(threadsPostDraft.id, draft.id));
      return { kind: "claimed", attemptId: row.id, draftId: draft.id, leaseToken, blocked };
    }
    return skip("no_drafts", blocked);
  });
}
