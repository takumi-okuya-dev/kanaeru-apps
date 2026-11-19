// 表の行を、窓口で返す形（@workspace/contracts/threads）にする。
import { STRATEGY_TOTAL, countFilled } from "@workspace/contracts/threads";
import type {
  BlockedReason,
  NgWord,
  PublishError,
  PostDraft,
  PostMention,
  RejectReasonCode,
  Strategy,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import type {
  DraftCountsRecord,
  NgWordRecord,
  PostDraftRecord,
  ThreadsAccountRecord,
  ThreadsStrategyRecord,
} from "./repository.ts";
import { toStrategyValues } from "./repository.ts";

/**
 * 運用アカウントの行を、返す形にする。
 * @param account 運用アカウントの行
 * @param counts 状態ごとの案の数
 * @returns 運用アカウント
 */
export function toThreadsAccount(
  account: ThreadsAccountRecord,
  counts: DraftCountsRecord,
): ThreadsAccount {
  return {
    id: account.id,
    name: account.name,
    counts: {
      needsReview: counts.needs_review,
      approved: counts.approved + counts.publishing,
      rejected: counts.rejected,
      published: counts.published,
      publishFailed: counts.publish_failed,
    },
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/**
 * 戦略の行を、返す形にする（行がなければ空の値と版 0）。
 * @param row 戦略の行
 * @returns 戦略
 */
export function toStrategy(row: ThreadsStrategyRecord | null): Strategy {
  const values = toStrategyValues(row);
  return {
    ...values,
    version: row?.version ?? 0,
    filledCount: countFilled(values),
    total: STRATEGY_TOTAL,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
}

/**
 * 投稿の案の行を、返す形にする。
 * @param row 案の行
 * @param mention 時間差のメンション（threads-007。読んでいなければ null）
 * @returns 投稿の案
 */
export function toPostDraft(row: PostDraftRecord, mention: PostMention | null = null): PostDraft {
  return {
    id: row.id,
    batchId: row.batchId,
    position: row.position,
    body: row.body,
    status: row.status,
    version: row.version,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    // DB の CHECK で、却下の理由の候補の code だけが入る
    rejectReasons: (row.rejectReasons as RejectReasonCode[] | null) ?? null,
    rejectNote: row.rejectNote,
    prioritizedAt: row.prioritizedAt ? row.prioritizedAt.toISOString() : null,
    carryover: row.carryoverAttemptId !== null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    threadsPermalink: row.threadsPermalink,
    publishFailedAt: row.publishFailedAt ? row.publishFailedAt.toISOString() : null,
    // DB の CHECK で、決まった code だけが入る
    publishError: (row.publishError as PublishError | null) ?? null,
    blockedReason: (row.blockedReason as BlockedReason | null) ?? null,
    blockedWords: row.blockedWords,
    mention,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * NG ワードの行を、返す形にする。
 * @param row NG ワードの行
 * @returns NG ワード
 */
export function toNgWord(row: NgWordRecord): NgWord {
  return { id: row.id, word: row.word };
}
