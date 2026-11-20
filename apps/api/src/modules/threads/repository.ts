// Threads の運用の読み書き（表は threads の領域だけが読み書きする。AD-3）。
// どの読み書きも、持ち主の確かめ（findOwnedAccount）を通った運用アカウントの ID で絞る（ほかの人の記録に届かない）。
// 版（version）を持つ記録は、読んだ版と同じときだけ書き、違えば null を返す（呼ぶ側が THREADS_VERSION_CONFLICT にする）。
import {
  NEEDS_REVIEW_LIMIT,
  REJECTED_LIST_MAX,
  STRATEGY_TEXT_KEYS,
  THREADS_ACCOUNT_LIMIT,
  emptyStrategyValues,
} from "@workspace/contracts/threads";
import type {
  DraftListStatus,
  DraftStatus,
  PromptSettings,
  StrategyTextKey,
  StrategyValues,
  TonePreset,
} from "@workspace/contracts/threads";
import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
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
 * 運用アカウントを開いた日時を残す（/threads で最後に使った運用アカウントへ移るのに使う。threads-012）。
 * 後から届いた古い要求で戻さないよう、残っている日時より新しいときだけ書く。直した日時（updated_at）は変えない。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param openedAt 要求を受け取った日時
 */
export async function markAccountOpened(
  db: Executor,
  threadsAccountId: string,
  openedAt: Date,
): Promise<void> {
  await db
    .update(threadsAccount)
    .set({ lastOpenedAt: openedAt, updatedAt: sql`${threadsAccount.updatedAt}` })
    .where(
      and(
        eq(threadsAccount.id, threadsAccountId),
        or(isNull(threadsAccount.lastOpenedAt), lt(threadsAccount.lastOpenedAt, openedAt)),
      ),
    );
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
    // 材料を変えた日時も残す（ためたまとまりに写し、反応の CSV で見る。threads-012）
    .set({ coreRules, coreRulesChangedAt: sql`now()` })
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
 * 案を一覧の状態で読む。承認待ちはためた新しいまとまりが先（まとまりの中は貼った順。めぐるの FR-018。threads-011）、
 * 承認済みは投稿の順（投稿中を含む）、投稿に失敗・却下は新しい順（500件まで）。投稿済みは listPublishedPage（50件ずつ）。
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
    // まとまりの ID は uuidv7（時刻の順）なので、作った日時が同じでもまとまりの新しい順に並ぶ
    return query.orderBy(
      desc(threadsPostDraft.createdAt),
      desc(threadsPostDraft.batchId),
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
 * 似ている度合いを比べる相手（承認待ち・承認済み〈投稿中を含む〉のすべてと、却下の新しい500件。めぐるの FR-026 と同じ。threads-011）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 相手（ID・本文・状態）
 */
export async function listCompareBodies(
  db: Executor,
  threadsAccountId: string,
): Promise<{ id: string; body: string; status: DraftStatus }[]> {
  const columns = {
    id: threadsPostDraft.id,
    body: threadsPostDraft.body,
    status: threadsPostDraft.status,
  };
  const [open, rejected] = await Promise.all([
    db
      .select(columns)
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          inArray(threadsPostDraft.status, ["needs_review", "approved", "publishing"]),
        ),
      ),
    db
      .select(columns)
      .from(threadsPostDraft)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, threadsAccountId),
          eq(threadsPostDraft.status, "rejected"),
        ),
      )
      .orderBy(desc(threadsPostDraft.reviewedAt), desc(threadsPostDraft.id))
      .limit(LIST_MAX),
  ]);
  return [...open, ...rejected];
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
  | {
      kind: "created";
      batchId: string;
      draftCount: number;
      delimiterFound: boolean;
      drafts: PostDraftRecord[];
    }
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
  input: {
    clientRequestId: string;
    parts: string[];
    delimiterFound: boolean;
    /** ためた人（threads-013。誰がしたかの記録） */
    actorAccountId?: string | null;
  },
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
      // 送り直しでは、まだ承認待ちのもの（取り消し・承認のあとに残っているもの）だけを返す（めぐると同じ）
      const drafts = await tx
        .select()
        .from(threadsPostDraft)
        .where(
          and(
            eq(threadsPostDraft.batchId, existing.id),
            eq(threadsPostDraft.status, "needs_review"),
          ),
        )
        .orderBy(asc(threadsPostDraft.position));
      return {
        kind: "created",
        batchId: existing.id,
        draftCount: existing.draftCount,
        delimiterFound: existing.delimiterFound,
        drafts,
      };
    }
    const counts = await countDrafts(tx, threadsAccountId);
    if (counts.needs_review + input.parts.length > NEEDS_REVIEW_LIMIT) return { kind: "limit" };
    // ためた時点のプロンプトの材料の版（反応の CSV に出す。めぐるの 006 FR-002g。threads-012）
    const [materials] = await tx
      .select({
        strategyUpdatedAt: threadsStrategy.updatedAt,
        promotionsChangedAt: threadsAccount.promotionsChangedAt,
        researchChangedAt: threadsAccount.researchChangedAt,
        coreRulesChangedAt: threadsAccount.coreRulesChangedAt,
      })
      .from(threadsAccount)
      .leftJoin(threadsStrategy, eq(threadsStrategy.threadsAccountId, threadsAccount.id))
      .where(eq(threadsAccount.id, threadsAccountId))
      .limit(1);
    const [batch] = await tx
      .insert(threadsDraftBatch)
      .values({
        threadsAccountId,
        clientRequestId: input.clientRequestId,
        draftCount: input.parts.length,
        delimiterFound: input.delimiterFound,
        strategyUpdatedAt: materials?.strategyUpdatedAt ?? null,
        promotionsChangedAt: materials?.promotionsChangedAt ?? null,
        researchChangedAt: materials?.researchChangedAt ?? null,
        coreRulesChangedAt: materials?.coreRulesChangedAt ?? null,
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
          createdByAccountId: input.actorAccountId ?? null,
          updatedByAccountId: input.actorAccountId ?? null,
        })),
      )
      .returning();
    drafts.sort((a, b) => a.position - b.position);
    return {
      kind: "created",
      batchId: batch.id,
      draftCount: batch.draftCount,
      delimiterFound: batch.delimiterFound,
      drafts,
    };
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

/** 消せる案の状態（めぐると同じ。承認済み・投稿に失敗は承認待ちに戻してから、投稿済みは反応の記録が消えるので消さない。threads-011）。 */
export const DELETABLE_STATUSES: readonly PostDraftRecord["status"][] = [
  "needs_review",
  "rejected",
];

/**
 * 案を消す（承認待ち・却下だけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftIds 案の ID（ほかの状態・ほかの運用アカウントのものは無視する）
 * @param statuses 消してよい状態（既定は承認待ちと却下）
 * @returns 消した案
 */
export async function deleteDrafts(
  db: Executor,
  threadsAccountId: string,
  draftIds: readonly string[],
  statuses: readonly PostDraftRecord["status"][] = DELETABLE_STATUSES,
): Promise<PostDraftRecord[]> {
  if (draftIds.length === 0 || statuses.length === 0) return [];
  return db
    .delete(threadsPostDraft)
    .where(
      and(
        inArray(threadsPostDraft.id, [...draftIds]),
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        inArray(threadsPostDraft.status, [...statuses]),
      ),
    )
    .returning();
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

/** 案の状態を変える値（requeue：投稿に失敗をもう一度投稿の順の先頭に入れる。承認した日時は元のまま。threads-011）。 */
export type DraftStateChange =
  | { status: "approved" }
  | { status: "requeue" }
  | { status: "rejected"; reasons: string[] | null; note: string | null }
  | { status: "needs_review" };

/**
 * 案の状態を変える（版を1つ増やす）。
 * @param tx トランザクション
 * @param draftIds 案の ID（鍵をかけて確かめたもの）
 * @param change 変える値
 * @param requestId 変えた承認・却下の操作の ID（送り直しを見分ける。ほかの変え方では null）
 * @param reviewerAccountId 承認・却下した人（threads-013。人の操作のときだけ渡す。渡さなければ変えない）
 * @returns 変えた案
 */
export async function changeDraftState(
  tx: Executor,
  draftIds: string[],
  change: DraftStateChange,
  requestId: string | null = null,
  reviewerAccountId?: string | null,
): Promise<PostDraftRecord[]> {
  if (draftIds.length === 0) return [];
  // 状態が変わるときは、投稿の順・投稿の記録・直前の確かめの記録を消す（DB の CHECK が状態ごとに縛る）
  const base = {
    version: sql`${threadsPostDraft.version} + 1`,
    lastReviewRequestId: requestId,
    prioritizedAt: null,
    carryoverAttemptId: null,
    publishFailedAt: null,
    publishError: null,
    blockedAt: null,
    blockedReason: null,
    blockedWords: null,
  };
  const values =
    change.status === "requeue"
      ? // 投稿の順の先頭（持ち越しの次）に入れ、承認した日時は元のまま残す（めぐるの 005 research.md R4）
        { ...base, status: "approved" as const, prioritizedAt: sql`now()` }
      : change.status === "approved"
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
  // 承認・却下した人（threads-013）。人の操作のときだけ書き、承認待ちに戻したら消す
  const reviewer =
    reviewerAccountId === undefined
      ? {}
      : { reviewedByAccountId: values.status === "needs_review" ? null : reviewerAccountId };
  return tx
    .update(threadsPostDraft)
    .set({ ...values, ...reviewer })
    .where(inArray(threadsPostDraft.id, draftIds))
    .returning();
}
