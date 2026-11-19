// 投稿の設定（threads-002。めぐるの publish/posting-schedule-service.ts を写した）。
// 入力は約束の PostingScheduleSaveInput（validatePostingSchedule と、夜間の DB の停止を見こんだ選べる幅）で確かめてある。
// 版で保存の衝突を止め、オフ→オン・時刻・ずらすかが変わったときだけ effective_from を今にする（それより前の予定は投稿しない）。
import {
  AUTOPOST_SLOT_WINDOW_MINUTES,
  THREADS_ERRORS,
  minutesToTime,
  timeToMinutes,
} from "@workspace/contracts/threads";
import type {
  AutoPostState,
  PostingSchedule,
  PostingScheduleSaveInput,
  ThreadsCheck,
} from "@workspace/contracts/threads";
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { isForeignKeyViolation } from "./pg.ts";
import { checkPublish } from "./connection.ts";
import { threadsPostingSchedule } from "./schema.ts";
import type { threadsAccount } from "./schema.ts";

/** 投稿の設定の行。 */
export type PostingScheduleRow = typeof threadsPostingSchedule.$inferSelect;

/**
 * 運用アカウントの投稿の設定を読む。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 行。最初の保存の前は null
 */
export async function readPostingSchedule(
  db: Executor,
  threadsAccountId: string,
): Promise<PostingScheduleRow | null> {
  const [row] = await db
    .select()
    .from(threadsPostingSchedule)
    .where(eq(threadsPostingSchedule.threadsAccountId, threadsAccountId))
    .limit(1);
  return row ?? null;
}

/**
 * 行を、返す形にする（なければ既定値：オフ・時刻なし・ずらす・版 0）。
 * @param row 投稿の設定の行
 * @returns 投稿の設定
 */
export function toPostingSchedule(row: PostingScheduleRow | null): PostingSchedule {
  if (!row) return { enabled: false, slotTimes: [], jitter: true, version: 0 };
  return {
    enabled: row.enabled,
    slotTimes: row.slotMinutes.map(minutesToTime),
    jitter: row.jitter,
    version: row.version,
  };
}

/**
 * 自動投稿の状態（オン・オフ、時刻の数、止まっている理由）。
 * @param connectionStatus 接続の状態
 * @param row 投稿の設定の行
 * @param now 今
 * @returns 自動投稿の状態
 */
export function toAutoPostState(
  connectionStatus: (typeof threadsAccount.$inferSelect)["connectionStatus"],
  row: PostingScheduleRow | null,
  now: Date,
): AutoPostState {
  const enabled = row?.enabled ?? false;
  let stoppedReason: AutoPostState["stoppedReason"] = null;
  if (enabled && connectionStatus === "needs_reconnect") stoppedReason = "needs_reconnect";
  else if (enabled && connectionStatus === "not_connected") stoppedReason = "not_connected";
  else if (enabled && row?.pausedUntil && row.pausedUntil.getTime() > now.getTime()) {
    stoppedReason = "rate_limited";
  }
  return { enabled, slotCount: row?.slotMinutes.length ?? 0, stoppedReason };
}

/**
 * 2つの時刻の並びが同じか。
 * @param a 保存してある時刻
 * @param b 新しい時刻
 * @returns 同じなら true
 */
function sameMinutes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((minute, index) => minute === b[index]);
}

/**
 * 投稿の設定を保存する。オンにする保存では、保存の前に投稿の権限を確かめる（テストの投稿はしない）。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID
 * @param input 入力（約束で確かめたもの）
 * @param now 今
 * @returns 保存した設定と、オンにしたときの確かめの結果
 * @throws {AppError} 版が合わない（THREADS_VERSION_CONFLICT）・投稿できる状態でない（THREADS_NOT_READY）・ない（NOT_FOUND）
 */
export async function savePostingSchedule(
  deps: DomainRouteDeps,
  threadsAccountId: string,
  input: PostingScheduleSaveInput,
  now: Date = new Date(),
): Promise<{ schedule: PostingSchedule; connectionCheck: ThreadsCheck | null }> {
  const slotMinutes = input.slotTimes
    .map((time) => timeToMinutes(time))
    .filter((minute): minute is number => minute !== null)
    .sort((a, b) => a - b);
  // 約束で確かめているが、幅の外の時刻は DB に書かない（二重の守り）
  const [from, to] = AUTOPOST_SLOT_WINDOW_MINUTES;
  if (slotMinutes.some((minute) => minute < from || minute > to))
    throw new AppError("INVALID_INPUT");
  const current = await readPostingSchedule(deps.db, threadsAccountId);
  if ((current?.version ?? 0) !== input.version) {
    throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
  }
  let connectionCheck: ThreadsCheck | null = null;
  if (input.enabled) {
    connectionCheck = await checkPublish(deps, threadsAccountId);
    if (
      connectionCheck.status === "needs_reconnect" ||
      connectionCheck.status === "no_publish_permission" ||
      connectionCheck.status === "not_connected"
    ) {
      throw new AppError(THREADS_ERRORS.THREADS_NOT_READY);
    }
  }
  const timingChanged =
    !current ||
    (!current.enabled && input.enabled) ||
    !sameMinutes(current.slotMinutes, slotMinutes) ||
    current.jitter !== input.jitter;
  const values = {
    enabled: input.enabled,
    slotMinutes,
    jitter: input.jitter,
    ...(timingChanged ? { effectiveFrom: now } : {}),
  };
  try {
    const [row] = current
      ? await deps.db
          .update(threadsPostingSchedule)
          .set({ ...values, version: sql`${threadsPostingSchedule.version} + 1` })
          .where(
            and(
              eq(threadsPostingSchedule.threadsAccountId, threadsAccountId),
              eq(threadsPostingSchedule.version, input.version),
            ),
          )
          .returning()
      : await deps.db
          .insert(threadsPostingSchedule)
          .values({ threadsAccountId, ...values, effectiveFrom: now })
          .onConflictDoNothing()
          .returning();
    if (!row) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    return { schedule: toPostingSchedule(row), connectionCheck };
  } catch (error) {
    // 途中で運用アカウントが消された
    if (isForeignKeyViolation(error)) throw new AppError("NOT_FOUND");
    throw error;
  }
}

/**
 * 「投稿の直前に承認待ちへ戻した」の知らせを閉じる（今より前に戻したものを出さない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 */
export async function markBlockedNoticeSeen(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<void> {
  await db
    .insert(threadsPostingSchedule)
    .values({ threadsAccountId, blockedNoticeSeenAt: now })
    .onConflictDoUpdate({
      target: threadsPostingSchedule.threadsAccountId,
      set: { blockedNoticeSeenAt: now },
    });
}
