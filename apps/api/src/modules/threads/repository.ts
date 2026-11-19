// Threads の運用の読み書き（表は threads の領域だけが読み書きする。AD-3）。
// どの読み書きも、持ち主の確かめ（findOwnedAccount）を通った運用アカウントの ID で絞る（ほかの人の記録に届かない）。
// 版（version）を持つ記録は、読んだ版と同じときだけ書き、違えば null を返す（呼ぶ側が THREADS_VERSION_CONFLICT にする）。
import {
  NEEDS_REVIEW_LIMIT,
  NG_WORD_LIMIT,
  REJECTED_LIST_MAX,
  STRATEGY_TEXT_KEYS,
  THREADS_ACCOUNT_LIMIT,
  emptyStrategyValues,
  normalizeNgWord,
} from "@workspace/contracts/threads";
import type {
  DraftListStatus,
  DraftStatus,
  PromptSettings,
  StrategyTextKey,
  StrategyValues,
  TonePreset,
} from "@workspace/contracts/threads";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import { lockKey } from "./locks.ts";
import {
  threadsAccount,
  threadsDraftBatch,
  threadsNgWord,
  threadsPostDraft,
  threadsStrategy,
} from "./schema.ts";

/** 運用アカウントの行。 */
export type ThreadsAccountRecord = typeof threadsAccount.$inferSelect;

/** 戦略の行。 */
export type ThreadsStrategyRecord = typeof threadsStrategy.$inferSelect;

/** 投稿の案の行。 */
export type PostDraftRecord = typeof threadsPostDraft.$inferSelect;

/** NG ワードの行。 */
export type NgWordRecord = typeof threadsNgWord.$inferSelect;

/** 状態ごとの案の数。 */
export type DraftCountsRecord = Record<DraftStatus, number>;

/**
 * どの状態も0の数。
 * @returns 数
 */
export function emptyDraftCounts(): DraftCountsRecord {
  return {
    needs_review: 0,
    approved: 0,
    rejected: 0,
    publishing: 0,
    published: 0,
    publish_failed: 0,
  };
}

/**
 * 運用アカウントごとの状態ごとの案の数。
 * @param db DB
 * @param threadsAccountIds 運用アカウントの ID
 * @returns ID ごとの数（案がなければ0）
 */
async function countDraftsByAccount(
  db: Executor,
  threadsAccountIds: string[],
): Promise<Map<string, DraftCountsRecord>> {
  const result = new Map<string, DraftCountsRecord>(
    threadsAccountIds.map((id) => [id, emptyDraftCounts()]),
  );
  if (threadsAccountIds.length === 0) return result;
  const rows = await db
    .select({
      threadsAccountId: threadsPostDraft.threadsAccountId,
      status: threadsPostDraft.status,
      total: count(),
    })
    .from(threadsPostDraft)
    .where(inArray(threadsPostDraft.threadsAccountId, threadsAccountIds))
    .groupBy(threadsPostDraft.threadsAccountId, threadsPostDraft.status);
  for (const row of rows) {
    const counts = result.get(row.threadsAccountId);
    if (counts) counts[row.status] = row.total;
  }
  return result;
}

/**
 * 持ち主の運用アカウントの一覧（作った古い順）と、状態ごとの案の数。
 * @param db DB
 * @param ownerId 持ち主の account の ID
 * @returns 運用アカウントと数の組
 */
export async function listAccounts(
  db: Db,
  ownerId: string,
): Promise<{ account: ThreadsAccountRecord; counts: DraftCountsRecord }[]> {
  const accounts = await db
    .select()
    .from(threadsAccount)
    .where(eq(threadsAccount.accountId, ownerId))
    .orderBy(asc(threadsAccount.createdAt), asc(threadsAccount.id));
  const counts = await countDraftsByAccount(
    db,
    accounts.map((account) => account.id),
  );
  return accounts.map((account) => ({
    account,
    counts: counts.get(account.id) ?? emptyDraftCounts(),
  }));
}

/**
 * 1つの運用アカウントの状態ごとの案の数。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 数
 */
export async function countDrafts(
  db: Executor,
  threadsAccountId: string,
): Promise<DraftCountsRecord> {
  const counts = await countDraftsByAccount(db, [threadsAccountId]);
  return counts.get(threadsAccountId) ?? emptyDraftCounts();
}

/**
 * 持ち主の運用アカウントを読む（ほかの人のものは、ないのと同じ）。
 * @param db DB
 * @param ownerId 持ち主の account の ID
 * @param threadsAccountId 運用アカウントの ID
 * @returns 運用アカウント。ない・ほかの人のものなら null
 */
export async function findOwnedAccount(
  db: Executor,
  ownerId: string,
  threadsAccountId: string,
): Promise<ThreadsAccountRecord | null> {
  const [row] = await db
    .select()
    .from(threadsAccount)
    .where(and(eq(threadsAccount.id, threadsAccountId), eq(threadsAccount.accountId, ownerId)))
    .limit(1);
  return row ?? null;
}

/**
 * 運用アカウントを作る（持ち主ごとに上限まで）。
 * @param db DB
 * @param ownerId 持ち主の account の ID
 * @param name 名前
 * @returns 作った運用アカウント。上限を超えるなら null
 * @throws {Error} 行が返らなかったとき（ふつうは起きない）
 */
export async function createAccount(
  db: Db,
  ownerId: string,
  name: string,
): Promise<ThreadsAccountRecord | null> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `threads_account:${ownerId}`);
    const [owned] = await tx
      .select({ total: count() })
      .from(threadsAccount)
      .where(eq(threadsAccount.accountId, ownerId));
    if ((owned?.total ?? 0) >= THREADS_ACCOUNT_LIMIT) return null;
    const [row] = await tx.insert(threadsAccount).values({ accountId: ownerId, name }).returning();
    if (!row) throw new Error("運用アカウントを作れませんでした。");
    return row;
  });
}

/**
 * 運用アカウントの名前を直す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param name 名前
 * @returns 直した運用アカウント。もうなければ null
 */
export async function renameAccount(
  db: Db,
  threadsAccountId: string,
  name: string,
): Promise<ThreadsAccountRecord | null> {
  const [row] = await db
    .update(threadsAccount)
    .set({ name })
    .where(eq(threadsAccount.id, threadsAccountId))
    .returning();
  return row ?? null;
}

/**
 * 運用アカウントを消す（戦略・案・NG ワードも一緒に消える）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @returns 消したなら true
 */
export async function deleteAccount(db: Db, threadsAccountId: string): Promise<boolean> {
  const rows = await db
    .delete(threadsAccount)
    .where(eq(threadsAccount.id, threadsAccountId))
    .returning({ id: threadsAccount.id });
  return rows.length > 0;
}

/**
 * 戦略を読む。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 戦略の行。まだ保存していなければ null
 */
export async function findStrategy(
  db: Executor,
  threadsAccountId: string,
): Promise<ThreadsStrategyRecord | null> {
  const [row] = await db
    .select()
    .from(threadsStrategy)
    .where(eq(threadsStrategy.threadsAccountId, threadsAccountId))
    .limit(1);
  return row ?? null;
}

/**
 * 戦略の行を、戦略の値にする（行がなければ空の値）。
 * @param row 戦略の行
 * @returns 戦略の値
 */
export function toStrategyValues(row: ThreadsStrategyRecord | null): StrategyValues {
  if (!row) return emptyStrategyValues();
  const texts = Object.fromEntries(STRATEGY_TEXT_KEYS.map((key) => [key, row[key]])) as Record<
    StrategyTextKey,
    string
  >;
  return { ...texts, tonePreset: (row.tonePreset as TonePreset | null) ?? null };
}

/**
 * 戦略を保存する（全部を置きかえる）。読んだ版（まだなければ 0）と DB の版が同じときだけ書く。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param values 戦略の値
 * @param version 読んだ版
 * @returns 保存した行。版が合わなければ null
 */
export async function saveStrategy(
  db: Db,
  threadsAccountId: string,
  values: StrategyValues,
  version: number,
): Promise<ThreadsStrategyRecord | null> {
  if (version === 0) {
    try {
      const [row] = await db
        .insert(threadsStrategy)
        .values({ threadsAccountId, ...values })
        .returning();
      return row ?? null;
    } catch (error) {
      // 同じ運用アカウントの戦略を、ほかの画面が先に作った
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
  const [row] = await db
    .update(threadsStrategy)
    .set({ ...values, version: sql`${threadsStrategy.version} + 1` })
    .where(
      and(
        eq(threadsStrategy.threadsAccountId, threadsAccountId),
        eq(threadsStrategy.version, version),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * 運用アカウントの行から、プロンプトの設定を取り出す。
 * @param account 運用アカウント
 * @returns プロンプトの設定
 */
export function toPromptSettings(account: ThreadsAccountRecord): PromptSettings {
  return {
    count: account.promptPostCount,
    length: {
      target: account.postLengthTarget,
      shortLength: account.shortLength,
      mediumLength: account.mediumLength,
      longLength: account.longLength,
      shortRatio: account.shortRatio,
      mediumRatio: account.mediumRatio,
      longRatio: account.longRatio,
    },
  };
}

/**
 * プロンプトの設定を保存する。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param settings プロンプトの設定
 * @returns 直した運用アカウント。もうなければ null
 */
export async function savePromptSettings(
  db: Db,
  threadsAccountId: string,
  settings: PromptSettings,
): Promise<ThreadsAccountRecord | null> {
  const [row] = await db
    .update(threadsAccount)
    .set({
      promptPostCount: settings.count,
      postLengthTarget: settings.length.target,
      shortLength: settings.length.shortLength,
      mediumLength: settings.length.mediumLength,
      longLength: settings.length.longLength,
      shortRatio: settings.length.shortRatio,
      mediumRatio: settings.length.mediumRatio,
      longRatio: settings.length.longRatio,
    })
    .where(eq(threadsAccount.id, threadsAccountId))
    .returning();
  return row ?? null;
}

/**
 * 投稿のルールを保存する。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param coreRules 投稿のルール
 * @returns 直した運用アカウント。もうなければ null
 */
export async function saveCoreRules(
  db: Db,
  threadsAccountId: string,
  coreRules: string,
): Promise<ThreadsAccountRecord | null> {
  const [row] = await db
    .update(threadsAccount)
    .set({ coreRules })
    .where(eq(threadsAccount.id, threadsAccountId))
    .returning();
  return row ?? null;
}

/**
 * NG ワードの一覧（足した古い順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns NG ワード
 */
export async function listNgWords(db: Executor, threadsAccountId: string): Promise<NgWordRecord[]> {
  return db
    .select()
    .from(threadsNgWord)
    .where(eq(threadsNgWord.threadsAccountId, threadsAccountId))
    .orderBy(asc(threadsNgWord.seq));
}

/** NG ワードを足した結果。 */
export type AddNgWordResult =
  { kind: "added"; ngWord: NgWordRecord } | { kind: "duplicate" } | { kind: "limit" };

/**
 * NG ワードを足す（照合の形で同じものは1つ。運用アカウントごとに上限まで）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param word NG ワード（前後の空白を除いたもの）
 * @returns 足した結果
 * @throws {Error} 一意の制約の違反のほかの DB のエラー
 */
export async function addNgWord(
  db: Db,
  threadsAccountId: string,
  word: string,
): Promise<AddNgWordResult> {
  try {
    return await db.transaction(async (tx): Promise<AddNgWordResult> => {
      await lockKey(tx, `threads_ng_word:${threadsAccountId}`);
      const [owned] = await tx
        .select({ total: count() })
        .from(threadsNgWord)
        .where(eq(threadsNgWord.threadsAccountId, threadsAccountId));
      if ((owned?.total ?? 0) >= NG_WORD_LIMIT) return { kind: "limit" };
      const [row] = await tx
        .insert(threadsNgWord)
        .values({ threadsAccountId, word, normalized: normalizeNgWord(word) })
        .returning();
      if (!row) throw new Error("NGワードを足せませんでした。");
      return { kind: "added", ngWord: row };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "duplicate" };
    throw error;
  }
}

/**
 * NG ワードを外す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param ngWordId NG ワードの ID
 * @returns 外したなら true
 */
export async function deleteNgWord(
  db: Db,
  threadsAccountId: string,
  ngWordId: string,
): Promise<boolean> {
  const rows = await db
    .delete(threadsNgWord)
    .where(
      and(eq(threadsNgWord.id, ngWordId), eq(threadsNgWord.threadsAccountId, threadsAccountId)),
    )
    .returning({ id: threadsNgWord.id });
  return rows.length > 0;
}

/** 投稿済み・投稿に失敗・却下の一覧で返す件数の上限。 */
const LIST_MAX = REJECTED_LIST_MAX;

/**
 * 投稿の順の並び（投稿中 → 持ち越し → 「次に投稿する」の新しい順 → 承認した古い順 → ID。compareQueueOrder と同じ）。
 * @returns 並びの式
 */
function queueOrder() {
  return [
    sql`${threadsPostDraft.status} = 'publishing' DESC`,
    sql`${threadsPostDraft.carryoverAttemptId} IS NOT NULL DESC`,
    sql`${threadsPostDraft.prioritizedAt} DESC NULLS LAST`,
    asc(threadsPostDraft.reviewedAt),
    asc(threadsPostDraft.id),
  ];
}

/**
 * 投稿の順の案（承認済み。投稿中を含めるかを選ぶ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param options includePublishing：投稿中を含める
 * @param options.includePublishing 投稿中を含める
 * @returns 案（投稿の順）
 */
export async function listQueue(
  db: Executor,
  threadsAccountId: string,
  options: { includePublishing: boolean },
): Promise<PostDraftRecord[]> {
  return db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        inArray(
          threadsPostDraft.status,
          options.includePublishing ? ["approved", "publishing"] : ["approved"],
        ),
      ),
    )
    .orderBy(...queueOrder());
}

/**
 * 案を一覧の状態で読む。承認待ちは作った古い順、承認済みは投稿の順（投稿中を含む）、投稿済み・投稿に失敗・却下は新しい順。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param status 一覧の状態
 * @returns 案
 */
export async function listDrafts(
  db: Executor,
  threadsAccountId: string,
  status: DraftListStatus,
): Promise<PostDraftRecord[]> {
  if (status === "approved") return listQueue(db, threadsAccountId, { includePublishing: true });
  const where = and(
    eq(threadsPostDraft.threadsAccountId, threadsAccountId),
    eq(threadsPostDraft.status, status),
  );
  const query = db.select().from(threadsPostDraft).where(where);
  if (status === "needs_review") {
    return query.orderBy(
      asc(threadsPostDraft.createdAt),
      asc(threadsPostDraft.batchId),
      asc(threadsPostDraft.position),
    );
  }
  const newest =
    status === "published"
      ? threadsPostDraft.publishedAt
      : status === "publish_failed"
        ? threadsPostDraft.publishFailedAt
        : threadsPostDraft.reviewedAt;
  return query.orderBy(desc(newest), desc(threadsPostDraft.id)).limit(LIST_MAX);
}

/**
 * 「次に投稿する」を付ける・外す（承認済みで、読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param prioritized 付けるなら true
 * @param version 読んだ版
 * @returns 変えた案。承認済みでない・版が合わなければ null
 */
export async function setPriority(
  db: Db,
  threadsAccountId: string,
  draftId: string,
  prioritized: boolean,
  version: number,
): Promise<PostDraftRecord | null> {
  const [row] = await db
    .update(threadsPostDraft)
    .set({
      prioritizedAt: prioritized ? sql`now()` : null,
      version: sql`${threadsPostDraft.version} + 1`,
    })
    .where(
      and(
        eq(threadsPostDraft.id, draftId),
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        eq(threadsPostDraft.status, "approved"),
        eq(threadsPostDraft.version, version),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * 似ている度合いを比べる相手（承認待ち・承認済みの案の ID と本文）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 相手
 */
export async function listCompareBodies(
  db: Executor,
  threadsAccountId: string,
): Promise<{ id: string; body: string }[]> {
  return db
    .select({ id: threadsPostDraft.id, body: threadsPostDraft.body })
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        inArray(threadsPostDraft.status, ["needs_review", "approved", "publishing", "published"]),
      ),
    );
}

/**
 * プロンプトに入れる最近の案（承認待ち・承認済み）の本文。新しい順。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param limit 件数
 * @returns 本文
 */
export async function listRecentDraftBodies(
  db: Executor,
  threadsAccountId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ body: threadsPostDraft.body })
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        inArray(threadsPostDraft.status, ["needs_review", "approved", "publishing", "published"]),
      ),
    )
    .orderBy(
      desc(threadsPostDraft.createdAt),
      desc(threadsPostDraft.batchId),
      desc(threadsPostDraft.position),
    )
    .limit(limit);
  return rows.map((row) => row.body);
}

/**
 * プロンプトに入れる却下の案。却下した新しい順。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param limit 件数
 * @returns 却下の案
 */
export async function listRecentRejected(
  db: Executor,
  threadsAccountId: string,
  limit: number,
): Promise<PostDraftRecord[]> {
  return db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        eq(threadsPostDraft.status, "rejected"),
      ),
    )
    .orderBy(desc(threadsPostDraft.reviewedAt), desc(threadsPostDraft.id))
    .limit(limit);
}

/** 案をまとめてためた結果。 */
export type CreateBatchResult =
  | { kind: "created"; batchId: string; delimiterFound: boolean; drafts: PostDraftRecord[] }
  | { kind: "limit" };

/**
 * 案をまとめてためる。同じ送り直し（clientRequestId）なら、前にためた案を返す（二重にためない）。
 * 承認待ちの案は、運用アカウントごとに NEEDS_REVIEW_LIMIT 件まで。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param input 送り直しの ID・分けた本文・区切りが見つかったか
 * @param input.clientRequestId 送り直しの ID
 * @param input.parts 分けた本文（1件以上）
 * @param input.delimiterFound 区切りが見つかったか
 * @returns ためた結果
 * @throws {Error} 行が返らなかったとき（ふつうは起きない）
 */
export async function createBatch(
  db: Db,
  threadsAccountId: string,
  input: { clientRequestId: string; parts: string[]; delimiterFound: boolean },
): Promise<CreateBatchResult> {
  return db.transaction(async (tx): Promise<CreateBatchResult> => {
    await lockKey(tx, `threads_post_draft:${threadsAccountId}`);
    const [existing] = await tx
      .select()
      .from(threadsDraftBatch)
      .where(
        and(
          eq(threadsDraftBatch.threadsAccountId, threadsAccountId),
          eq(threadsDraftBatch.clientRequestId, input.clientRequestId),
        ),
      )
      .limit(1);
    if (existing) {
      const drafts = await tx
        .select()
        .from(threadsPostDraft)
        .where(eq(threadsPostDraft.batchId, existing.id))
        .orderBy(asc(threadsPostDraft.position));
      return {
        kind: "created",
        batchId: existing.id,
        delimiterFound: existing.delimiterFound,
        drafts,
      };
    }
    const counts = await countDrafts(tx, threadsAccountId);
    if (counts.needs_review + input.parts.length > NEEDS_REVIEW_LIMIT) return { kind: "limit" };
    const [batch] = await tx
      .insert(threadsDraftBatch)
      .values({
        threadsAccountId,
        clientRequestId: input.clientRequestId,
        draftCount: input.parts.length,
        delimiterFound: input.delimiterFound,
      })
      .returning();
    if (!batch) throw new Error("案のまとまりを作れませんでした。");
    const drafts = await tx
      .insert(threadsPostDraft)
      .values(
        input.parts.map((body, position) => ({
          threadsAccountId,
          batchId: batch.id,
          position,
          body,
        })),
      )
      .returning();
    drafts.sort((a, b) => a.position - b.position);
    return { kind: "created", batchId: batch.id, delimiterFound: batch.delimiterFound, drafts };
  });
}

/**
 * 案を1つ読む。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @returns 案。なければ null
 */
export async function findDraft(
  db: Executor,
  threadsAccountId: string,
  draftId: string,
): Promise<PostDraftRecord | null> {
  const [row] = await db
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.id, draftId),
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * 承認待ちの案の本文を直す（読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param body 本文
 * @param version 読んだ版
 * @returns 直した案。版が合わない・承認待ちでなければ null
 */
export async function updateDraftBody(
  db: Db,
  threadsAccountId: string,
  draftId: string,
  body: string,
  version: number,
): Promise<PostDraftRecord | null> {
  const [row] = await db
    .update(threadsPostDraft)
    .set({ body, version: sql`${threadsPostDraft.version} + 1` })
    .where(
      and(
        eq(threadsPostDraft.id, draftId),
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        eq(threadsPostDraft.status, "needs_review"),
        eq(threadsPostDraft.version, version),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * 案を消す（投稿中は消さない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @returns 消したなら true
 */
export async function deleteDraft(
  db: Db,
  threadsAccountId: string,
  draftId: string,
): Promise<boolean> {
  const rows = await db
    .delete(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.id, draftId),
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        ne(threadsPostDraft.status, "publishing"),
      ),
    )
    .returning({ id: threadsPostDraft.id });
  return rows.length > 0;
}

/**
 * 承認・却下・承認待ちに戻すために、案を鍵をかけて読む（同じ案を同時に変えない）。
 * @param tx トランザクション
 * @param threadsAccountId 運用アカウントの ID
 * @param draftIds 案の ID
 * @returns 案（その運用アカウントのものだけ）
 */
export async function lockDrafts(
  tx: Executor,
  threadsAccountId: string,
  draftIds: string[],
): Promise<PostDraftRecord[]> {
  return tx
    .select()
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        inArray(threadsPostDraft.id, draftIds),
      ),
    )
    .for("update");
}

/** 案の状態を変える値。 */
export type DraftStateChange =
  | { status: "approved" }
  | { status: "rejected"; reasons: string[] | null; note: string | null }
  | { status: "needs_review" };

/**
 * 案の状態を変える（版を1つ増やす）。
 * @param tx トランザクション
 * @param draftIds 案の ID（鍵をかけて確かめたもの）
 * @param change 変える値
 * @returns 変えた案
 */
export async function changeDraftState(
  tx: Executor,
  draftIds: string[],
  change: DraftStateChange,
): Promise<PostDraftRecord[]> {
  // 状態が変わるときは、投稿の順・投稿の記録・直前の確かめの記録を消す（DB の CHECK が状態ごとに縛る）
  const base = {
    version: sql`${threadsPostDraft.version} + 1`,
    prioritizedAt: null,
    carryoverAttemptId: null,
    publishFailedAt: null,
    publishError: null,
    blockedAt: null,
    blockedReason: null,
    blockedWords: null,
  };
  const values =
    change.status === "approved"
      ? {
          ...base,
          status: "approved" as const,
          reviewedAt: sql`now()`,
          rejectReasons: null,
          rejectNote: null,
        }
      : change.status === "rejected"
        ? {
            ...base,
            status: "rejected" as const,
            reviewedAt: sql`now()`,
            rejectReasons: change.reasons,
            rejectNote: change.note,
          }
        : {
            ...base,
            status: "needs_review" as const,
            reviewedAt: null,
            rejectReasons: null,
            rejectNote: null,
          };
  return tx
    .update(threadsPostDraft)
    .set(values)
    .where(inArray(threadsPostDraft.id, draftIds))
    .returning();
}
