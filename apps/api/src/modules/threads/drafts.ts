// 投稿の案の操作（threads-011。めぐるの drafts/review-service.ts・draft-service.ts・posting-rules-service.ts を写した）。
// - 承認・却下・承認待ちに戻す：1件ずつ確かめ、できるものだけ変える。できなかったものは理由を返す（送り直しは requestId で見分ける）
// - 本文を直す：承認待ちと承認済み。承認済みは承認待ちに戻す（直した本文はもう一度承認が要る）
// - まとめて消す・ためたのを取り消す：承認待ちと却下だけ（投稿済みは反応の記録が消えるので消さない）
// - NG ワードをまとめて足す：足した語を含む承認済みの案を承認待ちに戻す
// - 投稿済みの一覧：50件ずつ（続きは nextCursor）
// 案の状態を変える書きこみは、案の鍵（threads_post_draft:<運用アカウント>）で1つずつにする（ためる・投稿の取り出しと同じ鍵）。
import {
  APPROVED_LIMIT,
  NEEDS_REVIEW_LIMIT,
  NG_WORD_LIMIT,
  PUBLISHED_PAGE_SIZE,
  checkPublishable,
  findNgWords,
  mergeChecks,
  normalizeNgWord,
} from "@workspace/contracts/threads";
import type { ReviewInput, ReviewSkipReason } from "@workspace/contracts/threads";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "@hono/zod-openapi";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { lockKey } from "./locks.ts";
import { dropPendingMentions, pendingMentionTexts } from "./mention.ts";
import {
  changeDraftState,
  countDrafts,
  deleteDrafts,
  listNgWords,
  lockDrafts,
} from "./repository.ts";
import type { DraftCountsRecord, NgWordRecord, PostDraftRecord } from "./repository.ts";
import { threadsDraftBatch, threadsNgWord, threadsPostDraft } from "./schema.ts";

/**
 * 案の鍵をかける（ためる・承認・直す・NG ワードを足す・投稿の取り出しを1つずつにする）。
 * @param tx トランザクション
 * @param threadsAccountId 運用アカウントの ID
 */
export async function lockAccountDrafts(tx: Executor, threadsAccountId: string): Promise<void> {
  await lockKey(tx, `threads_post_draft:${threadsAccountId}`);
}

/** 操作ごとに、変えてよい今の状態（kanaeru は承認済み・投稿に失敗の却下もできる。投稿に失敗の承認は投稿の順に入れ直す）。 */
const REVIEW_FROM: Record<ReviewInput["action"], readonly PostDraftRecord["status"][]> = {
  approve: ["needs_review", "publish_failed"],
  reject: ["needs_review", "approved", "publish_failed"],
  reopen: ["approved", "rejected", "publish_failed"],
};

/** 操作ごとの、変えたあとの状態。 */
const REVIEW_TARGET: Record<ReviewInput["action"], PostDraftRecord["status"]> = {
  approve: "approved",
  reject: "rejected",
  reopen: "needs_review",
};

/** 承認・却下の結果。 */
export type ReviewOutcome = {
  /** 変えた案（同じ操作の送り直しで、もう変わっていた案を含む。入力の順） */
  updated: PostDraftRecord[];
  /** 変えなかった案と理由 */
  skipped: { id: string; reason: ReviewSkipReason }[];
  /** 今回の要求で実際に変えた案（操作の記録に使う。送り直しでは空） */
  changed: PostDraftRecord[];
  /** 変えた案のうち、投稿に失敗から投稿の順に入れ直したものだけか */
  requeuedOnly: boolean;
  /** 変えたあとの数 */
  counts: DraftCountsRecord;
};

/**
 * 承認・却下・承認待ちに戻す（めぐるの reviewDrafts）。1件ずつ確かめ、できるものだけ変える。
 * - 投稿中は PUBLISHING。版が違う・今の状態ではできないものは STALE（同じ requestId でもう変わっていたものは変えたものとして返す）
 * - 承認：NG ワード・Threads の上限（返信の文も）・規約に注意の確かめ（confirmPolicyCaution）・承認済みの上限
 * - 投稿に失敗の承認：投稿の順の先頭に入れ直し、承認した日時は元のまま（承認済みの上限を数える）
 * - 承認待ちに戻す：承認待ちの上限を数える
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param input 承認・却下の入力
 * @param actorAccountId 承認・却下した人（threads-013。持ち主か、承認を任された担当の人）
 * @returns 変えた案・変えなかった案と理由・変えたあとの数
 */
export async function reviewDrafts(
  db: Db,
  threadsAccountId: string,
  input: ReviewInput,
  actorAccountId?: string | null,
): Promise<ReviewOutcome> {
  const requestId = input.requestId ?? null;
  return db.transaction(async (tx) => {
    // NG ワードを足すのと同じ鍵で1つずつにする（NG ワードを含む承認済みを残さない）
    await lockAccountDrafts(tx, threadsAccountId);
    const ids = [...new Set(input.items.map((item) => item.id))];
    // 案の行に鍵をかけてから、版と返信の文を読む（メンションを書く処理も案の行の鍵を取るので、承認の間に返信の文を変えられない）
    const rows = await lockDrafts(tx, threadsAccountId, ids);
    const [ngWords, counts, mentionTexts] = await Promise.all([
      input.action === "approve" ? listNgWords(tx, threadsAccountId) : Promise.resolve([]),
      countDrafts(tx, threadsAccountId),
      // 時間差のメンション（threads-007）：承認では返信の文も確かめる
      input.action === "approve"
        ? pendingMentionTexts(tx, ids)
        : Promise.resolve(new Map<string, string>()),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const target = REVIEW_TARGET[input.action];
    const already = new Map<string, PostDraftRecord>();
    const skipped: ReviewOutcome["skipped"] = [];
    const fresh: PostDraftRecord[] = [];
    const requeue: PostDraftRecord[] = [];
    // 上限は、この要求で先に変えた分も含めて数える
    let approved = counts.approved + counts.publishing;
    let needsReview = counts.needs_review;
    const seen = new Set<string>();
    for (const { id, version } of input.items) {
      if (seen.has(id)) continue;
      seen.add(id);
      const row = byId.get(id);
      if (!row) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (row.status === "publishing") {
        skipped.push({ id, reason: "PUBLISHING" });
        continue;
      }
      if (row.status === target) {
        // 自分の送り直し（同じ requestId）で、もう変わっていた
        if (requestId !== null && row.lastReviewRequestId === requestId) already.set(id, row);
        else skipped.push({ id, reason: "STALE" });
        continue;
      }
      if (row.version !== version || !REVIEW_FROM[input.action].includes(row.status)) {
        skipped.push({ id, reason: "STALE" });
        continue;
      }
      if (input.action === "approve") {
        const reply = mentionTexts.get(id);
        const check = mergeChecks(
          checkPublishable(row.body, ngWords),
          reply === undefined ? null : checkPublishable(reply, ngWords),
        );
        if (check.ngWords.length > 0) {
          skipped.push({ id, reason: "NG_WORD" });
          continue;
        }
        if (check.overThreadsLimit) {
          skipped.push({ id, reason: "OVER_THREADS_LIMIT" });
          continue;
        }
        // 規約に注意は承認を止めないが、画面で確かめていない承認は受けない（投稿に失敗の入れ直しは、承認のときに確かめ済み）
        if (
          row.status === "needs_review" &&
          check.policyCautions.length > 0 &&
          input.confirmPolicyCaution !== true
        ) {
          skipped.push({ id, reason: "POLICY_CONFIRM_REQUIRED" });
          continue;
        }
        if (approved + 1 > APPROVED_LIMIT) {
          skipped.push({ id, reason: "LIMIT" });
          continue;
        }
        approved += 1;
        if (row.status === "publish_failed") {
          requeue.push(row);
          continue;
        }
      }
      if (input.action === "reopen") {
        if (needsReview + 1 > NEEDS_REVIEW_LIMIT) {
          skipped.push({ id, reason: "LIMIT" });
          continue;
        }
        needsReview += 1;
      }
      fresh.push(row);
    }
    const freshIds = fresh.map((row) => row.id);
    if (input.action === "reject") await dropPendingMentions(tx, freshIds);
    const change =
      input.action === "approve"
        ? ({ status: "approved" } as const)
        : input.action === "reject"
          ? ({
              status: "rejected",
              reasons:
                input.reasons && input.reasons.length > 0 ? [...new Set(input.reasons)] : null,
              note: input.note ? input.note : null,
            } as const)
          : ({ status: "needs_review" } as const);
    const changed = [
      ...(await changeDraftState(tx, freshIds, change, requestId, actorAccountId)),
      ...(await changeDraftState(
        tx,
        requeue.map((row) => row.id),
        { status: "requeue" },
        requestId,
        actorAccountId,
      )),
    ];
    const changedById = new Map(changed.map((row) => [row.id, row]));
    const updated = [...seen]
      .map((id) => changedById.get(id) ?? already.get(id))
      .filter((row): row is PostDraftRecord => row !== undefined);
    return {
      updated,
      skipped,
      changed,
      requeuedOnly: changed.length > 0 && requeue.length === changed.length,
      counts: await countDrafts(tx, threadsAccountId),
    };
  });
}

/** 本文を直した結果。 */
export type EditOutcome =
  | { kind: "edited"; draft: PostDraftRecord; reopened: boolean }
  | { kind: "not_found" }
  | { kind: "state" }
  | { kind: "publishing" }
  | { kind: "conflict" };

/**
 * 案の本文を直す（めぐるの updateDraft）。承認待ちと承認済みが対象で、承認済みは同じ書きこみで承認待ちに戻す。
 * 本文は前後の空白を除いて保存し、前後の空白だけの違いは「直した」にしない。承認待ちの上限は確かめない（直している途中で保存できないのを避ける）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input 本文と読んだ版
 * @param input.body 本文
 * @param input.version 読んだ版
 * @param actorAccountId 直した人（threads-013。誰がしたかの記録）
 * @returns 直した結果
 */
export async function editDraft(
  db: Db,
  threadsAccountId: string,
  draftId: string,
  input: { body: string; version: number },
  actorAccountId: string | null = null,
): Promise<EditOutcome> {
  return db.transaction(async (tx): Promise<EditOutcome> => {
    await lockAccountDrafts(tx, threadsAccountId);
    const [before] = await tx
      .select()
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.id, draftId),
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        ),
      )
      .limit(1);
    if (!before) return { kind: "not_found" };
    // 投稿中は直せない（投稿する本文を変えない）
    if (before.status === "publishing") return { kind: "publishing" };
    if (before.status !== "needs_review" && before.status !== "approved") return { kind: "state" };
    if (before.version !== input.version) return { kind: "conflict" };
    const body = input.body.trim();
    const [row] = await tx
      .update(threadsPostDraft)
      .set({
        body,
        ...(before.body.trim() !== body ? { bodyEditedAt: sql`now()` } : {}),
        ...(actorAccountId ? { updatedByAccountId: actorAccountId } : {}),
        status: "needs_review",
        reviewedAt: null,
        lastReviewRequestId: null,
        // 承認待ちでは、投稿の順と直前の確かめの記録を持たない（DB の CHECK）
        prioritizedAt: null,
        carryoverAttemptId: null,
        blockedAt: null,
        blockedReason: null,
        blockedWords: null,
        version: sql`${threadsPostDraft.version} + 1`,
      })
      .where(and(eq(threadsPostDraft.id, draftId), eq(threadsPostDraft.version, input.version)))
      .returning();
    if (!row) return { kind: "conflict" };
    return { kind: "edited", draft: row, reopened: before.status === "approved" };
  });
}

/**
 * ためた1回分を取り消す（めぐるの deleteBatch）。そのまとまりの承認待ちの案だけを消し、まとまりの行は残す（送り直しで二重にためない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param batchId まとまりの ID
 * @returns 消した案。まとまりがない・ほかの運用アカウントのものなら null
 */
export async function undoBatch(
  db: Db,
  threadsAccountId: string,
  batchId: string,
): Promise<PostDraftRecord[] | null> {
  return db.transaction(async (tx) => {
    await lockAccountDrafts(tx, threadsAccountId);
    const [batch] = await tx
      .select({ id: threadsDraftBatch.id })
      .from(threadsDraftBatch)
      .where(
        and(
          eq(threadsDraftBatch.id, batchId),
          eq(threadsDraftBatch.threadsAccountId, threadsAccountId),
        ),
      )
      .limit(1);
    if (!batch) return null;
    return tx
      .delete(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.batchId, batchId),
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          eq(threadsPostDraft.status, "needs_review"),
        ),
      )
      .returning();
  });
}

/**
 * 案をまとめて消す（めぐるの deleteDrafts。承認待ちと却下だけ。ほかの状態・ない ID は無視する）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftIds 案の ID
 * @param statuses 消してよい状態（既定は承認待ちと却下。承認を任されていない担当の人は承認待ちだけ）
 * @returns 消した案
 */
export async function deleteDraftsLocked(
  db: Db,
  threadsAccountId: string,
  draftIds: readonly string[],
  statuses?: readonly PostDraftRecord["status"][],
): Promise<PostDraftRecord[]> {
  return db.transaction(async (tx) => {
    await lockAccountDrafts(tx, threadsAccountId);
    // 消してよい状態は、鍵をかけたこのトランザクションの中で確かめる（確かめてから消すまでに却下されたものは消さない）
    return deleteDrafts(tx, threadsAccountId, draftIds, statuses);
  });
}

/** NG ワードをまとめて足した結果。 */
export type AddNgWordsOutcome =
  | { kind: "added"; added: NgWordRecord[]; duplicates: string[]; reopened: number }
  | { kind: "limit" };

/**
 * NG ワードをまとめて足す（めぐるの addNgWords）。照合の形で同じものは足さずに duplicates に返す。上限を超えるなら何も足さない。
 * 足した語を含む承認済みの案は、承認待ちに戻す（「承認済み」は今の NG ワードを通ったものだけにする。承認待ちの上限は確かめない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param words 足す語（前後の空白を除いたもの）
 * @returns 足した結果
 * @throws {Error} 行が返らなかったとき（ふつうは起きない）
 */
export async function addNgWords(
  db: Db,
  threadsAccountId: string,
  words: readonly string[],
): Promise<AddNgWordsOutcome> {
  return db.transaction(async (tx): Promise<AddNgWordsOutcome> => {
    // 承認と同じ鍵（NG ワードを足すのと承認が同時でも、NG ワードを含む承認済みを残さない）
    await lockAccountDrafts(tx, threadsAccountId);
    const existing = await listNgWords(tx, threadsAccountId);
    // 同じものの判定も word から正規化し直す（保存した normalized は古いことがある）
    const seen = new Set(existing.map((row) => normalizeNgWord(row.word)));
    const toAdd: { word: string; normalized: string }[] = [];
    const duplicates: string[] = [];
    for (const raw of words) {
      const word = raw.trim();
      if (word === "") continue;
      const normalized = normalizeNgWord(word);
      if (seen.has(normalized)) {
        duplicates.push(word);
        continue;
      }
      seen.add(normalized);
      toAdd.push({ word, normalized });
    }
    if (existing.length + toAdd.length > NG_WORD_LIMIT) return { kind: "limit" };
    if (toAdd.length === 0) return { kind: "added", added: [], duplicates, reopened: 0 };
    // 足した順は seq（増え続ける番号）で持つ。1回の中も入れた順に番号が振られる
    const added = await tx
      .insert(threadsNgWord)
      .values(toAdd.map((item) => ({ threadsAccountId, ...item })))
      .returning();
    added.sort((a, b) => a.seq - b.seq);
    const approvedRows = await tx
      .select({ id: threadsPostDraft.id, body: threadsPostDraft.body })
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          eq(threadsPostDraft.status, "approved"),
        ),
      );
    const hitIds = approvedRows
      .filter((row) => findNgWords(row.body, toAdd).length > 0)
      .map((row) => row.id);
    await changeDraftState(tx, hitIds, { status: "needs_review" });
    return { kind: "added", added, duplicates, reopened: hitIds.length };
  });
}

/** 投稿済みの一覧のカーソルの形（投稿した日時・ID）。 */
const CursorShape = z.tuple([z.iso.datetime({ offset: true }), z.guid()]);

/**
 * 投稿済みの一覧のカーソルを、URL に載せられる文字にする。
 * @param publishedAt 投稿した日時
 * @param id 案の ID
 * @returns カーソル
 */
export function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([publishedAt.toISOString(), id])).toString("base64url");
}

/**
 * カーソルを読む。
 * @param cursor カーソル
 * @returns 投稿した日時と ID。壊れていれば null
 */
export function decodeCursor(cursor: string): { publishedAt: Date; id: string } | null {
  try {
    const parsed = CursorShape.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    return { publishedAt: new Date(parsed.data[0]), id: parsed.data[1] };
  } catch {
    return null;
  }
}

/**
 * 投稿済みの案を、投稿した新しい順（同じ日時は ID の順）に50件ずつ読む（めぐるの listPublishedPage）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param before 前の応答の nextCursor（はじめは undefined）
 * @returns 案と、続きを読むときのカーソル（続きがなければ null）
 * @throws {AppError} カーソルが壊れているとき（INVALID_INPUT。欄は before）
 */
export async function listPublishedPage(
  db: Executor,
  threadsAccountId: string,
  before: string | undefined,
): Promise<{ drafts: PostDraftRecord[]; nextCursor: string | null }> {
  const cursor = before ? decodeCursor(before) : null;
  if (before && !cursor) {
    throw new AppError("INVALID_INPUT", {
      fields: [
        { path: "before", message: "続きの位置が読めません。一覧を読みこみ直してください。" },
      ],
    });
  }
  const rows = await db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        eq(threadsPostDraft.status, "published"),
        cursor
          ? sql`(${threadsPostDraft.publishedAt} < ${cursor.publishedAt.toISOString()}
              OR (${threadsPostDraft.publishedAt} = ${cursor.publishedAt.toISOString()} AND ${threadsPostDraft.id} > ${cursor.id}))`
          : undefined,
      ),
    )
    .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
    .limit(PUBLISHED_PAGE_SIZE + 1);
  const page = rows.slice(0, PUBLISHED_PAGE_SIZE);
  const last = page.at(-1);
  return {
    drafts: page,
    nextCursor:
      rows.length > PUBLISHED_PAGE_SIZE && last?.publishedAt
        ? encodeCursor(last.publishedAt, last.id)
        : null,
  };
}
