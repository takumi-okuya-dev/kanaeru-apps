// 宣伝とリサーチの読み書き（threads-004。めぐるの strategy/promotion-routes・research-routes・item-service を写した）。
// どの読み書きも、持ち主を確かめた運用アカウントの ID で絞る。数の上限は運用アカウントごとの鍵の中で数える。
import {
  EXPLAIN_BATCH_MAX,
  KEYWORD_LIMIT,
  PROMOTION_LIMIT,
  PROMPT_REFERENCE_POSTS,
  REFERENCE_POST_LIMIT,
  THREADS_ERRORS,
  buildExplainPrompt,
  freshnessOf,
  isBlank,
  isExpired,
  isTargetable,
  jstToday,
  normalizeKeyword,
  shortIdsOf,
  sortForPrompt,
  sortPromotions,
} from "@workspace/contracts/threads";
import type {
  PostedDateMode,
  Promotion,
  PromotionInput,
  PromptPromotion,
  PromptReferencePost,
  ReferencePlatform,
  ReferencePost,
  ReferencePostInput,
  ResearchKeyword,
  ResearchKeywordInput,
  StrategyValues,
} from "@workspace/contracts/threads";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import { lockKey } from "./locks.ts";
import { threadsPromotion, threadsReferencePost, threadsResearchKeyword } from "./schema.ts";

/** 宣伝の行。 */
type PromotionRow = typeof threadsPromotion.$inferSelect;
/** 参考の投稿の行。 */
type ReferenceRow = typeof threadsReferencePost.$inferSelect;
/** キーワードの行。 */
type KeywordRow = typeof threadsResearchKeyword.$inferSelect;

// ---- 宣伝 ----

/**
 * 宣伝の行を返す形にする。
 * @param row 行
 * @param now 今
 * @returns 宣伝
 */
export function toPromotion(row: PromotionRow, now: Date): Promotion {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    targetLocation: row.targetLocation,
    targetPersona: row.targetPersona,
    targetAgeRange: row.targetAgeRange,
    cta: row.cta,
    linkedUrl: row.linkedUrl,
    priority: row.priority,
    status: row.status,
    validUntil: row.validUntil,
    event: row.event ?? null,
    isExpired: isExpired(row.validUntil, now),
    isTargetable: isTargetable(row.status, row.validUntil, now),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 宣伝の一覧（宣伝の対象を先に、優先度の高い順、新しい順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 宣伝
 */
export async function listPromotions(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<Promotion[]> {
  const rows = await db
    .select()
    .from(threadsPromotion)
    .where(eq(threadsPromotion.threadsAccountId, threadsAccountId));
  return sortPromotions(
    rows.map((row) => toPromotion(row, now)),
    now,
  );
}

/**
 * 宣伝の入力を、表の列にする。
 * @param input 入力
 * @returns 列
 */
function promotionColumns(input: PromotionInput) {
  return {
    title: input.title,
    content: input.content,
    targetLocation: input.targetLocation,
    targetPersona: input.targetPersona,
    targetAgeRange: input.targetAgeRange,
    cta: input.cta,
    linkedUrl: input.linkedUrl,
    priority: input.priority,
    status: input.status,
    validUntil: input.validUntil,
    event: input.event,
  };
}

/**
 * 宣伝を足す（運用アカウントごとに上限まで）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param input 入力
 * @returns 足した行
 * @throws {AppError} 上限（THREADS_ITEM_LIMIT）
 */
export async function createPromotion(
  db: Db,
  threadsAccountId: string,
  input: PromotionInput,
): Promise<PromotionRow> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `threads_promotion:${threadsAccountId}`);
    const [owned] = await tx
      .select({ total: count() })
      .from(threadsPromotion)
      .where(eq(threadsPromotion.threadsAccountId, threadsAccountId));
    if ((owned?.total ?? 0) >= PROMOTION_LIMIT)
      throw new AppError(THREADS_ERRORS.THREADS_ITEM_LIMIT);
    const [row] = await tx
      .insert(threadsPromotion)
      .values({ threadsAccountId, ...promotionColumns(input) })
      .returning();
    if (!row) throw new Error("宣伝を足せませんでした。");
    return row;
  });
}

/**
 * 宣伝を直す（読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param input 入力
 * @param version 読んだ版
 * @returns 直した行
 * @throws {AppError} ない（NOT_FOUND）・版が合わない（THREADS_VERSION_CONFLICT）
 */
export async function updatePromotion(
  db: Db,
  threadsAccountId: string,
  promotionId: string,
  input: PromotionInput,
  version: number,
): Promise<PromotionRow> {
  const where = and(
    eq(threadsPromotion.id, promotionId),
    eq(threadsPromotion.threadsAccountId, threadsAccountId),
  );
  const [row] = await db
    .update(threadsPromotion)
    .set({ ...promotionColumns(input), version: sql`${threadsPromotion.version} + 1` })
    .where(and(where, eq(threadsPromotion.version, version)))
    .returning();
  if (row) return row;
  const [exists] = await db.select({ id: threadsPromotion.id }).from(threadsPromotion).where(where);
  throw new AppError(exists ? THREADS_ERRORS.THREADS_VERSION_CONFLICT : "NOT_FOUND");
}

/**
 * 宣伝を消す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @returns 消したなら true
 */
export async function deletePromotion(
  db: Db,
  threadsAccountId: string,
  promotionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(threadsPromotion)
    .where(
      and(
        eq(threadsPromotion.id, promotionId),
        eq(threadsPromotion.threadsAccountId, threadsAccountId),
      ),
    )
    .returning({ id: threadsPromotion.id });
  return rows.length > 0;
}

/**
 * プロンプトに入れる宣伝（宣伝の対象だけ。掲載の期限の近い順、期限なしは最後、同じなら優先度の高い順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 宣伝
 */
export async function listPromptPromotions(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<PromptPromotion[]> {
  const rows = await db
    .select()
    .from(threadsPromotion)
    .where(eq(threadsPromotion.threadsAccountId, threadsAccountId));
  return rows
    .filter((row) => isTargetable(row.status, row.validUntil, now))
    .sort((a, b) => {
      if (a.validUntil !== b.validUntil) {
        if (a.validUntil === null) return 1;
        if (b.validUntil === null) return -1;
        return a.validUntil.localeCompare(b.validUntil);
      }
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((row) => ({
      title: row.title,
      validUntil: row.validUntil,
      content: row.content,
      targetLocation: row.targetLocation,
      targetPersona: row.targetPersona,
      targetAgeRange: row.targetAgeRange,
      cta: row.cta,
      linkedUrl: row.linkedUrl === "" ? null : row.linkedUrl,
      event: row.event ?? null,
    }));
}

// ---- 参考の投稿 ----

/**
 * 参考の投稿の行の反応の数。
 * @param row 行
 * @returns 数
 */
function metricsOf(row: ReferenceRow): ReferencePost["metrics"] {
  return {
    likes: row.metricLikes,
    replies: row.metricReplies,
    views: row.metricViews,
    saves: row.metricSaves,
    reposts: row.metricReposts,
    followers: row.metricFollowers,
  };
}

/**
 * 参考の投稿の行を返す形にする。
 * @param row 行
 * @param shortId 短い ID
 * @param today 今日（日本時間）
 * @returns 参考の投稿
 */
function toReferencePost(
  row: ReferenceRow,
  shortId: string | undefined,
  today: string,
): ReferencePost {
  const postedDateMode = row.postedDateMode as PostedDateMode;
  return {
    id: row.id,
    body: row.body,
    keyword: row.keyword,
    postUrl: row.postUrl,
    whyGood: row.whyGood,
    platform: row.platform as ReferencePlatform,
    postedDateMode,
    postedDate: row.postedDate,
    metrics: metricsOf(row),
    author: row.author,
    memo: row.memo,
    freshness: freshnessOf(
      { postedDateMode, postedDate: row.postedDate, createdAt: row.createdAt },
      today,
    ),
    shortId: shortId ?? row.id.replace(/-/g, "").slice(0, 8),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 参考の投稿の入力を、表の列にする。
 * @param input 入力
 * @returns 列
 */
function referenceColumns(input: ReferencePostInput) {
  return {
    body: input.body,
    keyword: input.keyword,
    postUrl: input.postUrl,
    whyGood: input.whyGood,
    platform: input.platform,
    postedDateMode: input.postedDateMode,
    postedDate: input.postedDateMode === "exact" ? input.postedDate : null,
    metricLikes: input.metrics.likes,
    metricReplies: input.metrics.replies,
    metricViews: input.metrics.views,
    metricSaves: input.metrics.saves,
    metricReposts: input.metrics.reposts,
    metricFollowers: input.metrics.followers,
    author: input.author,
    memo: input.memo,
  };
}

/**
 * 参考の投稿の一覧（足した新しい順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 参考の投稿
 */
export async function listReferencePosts(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<ReferencePost[]> {
  const rows = await db
    .select()
    .from(threadsReferencePost)
    .where(eq(threadsReferencePost.threadsAccountId, threadsAccountId))
    .orderBy(desc(threadsReferencePost.createdAt), desc(threadsReferencePost.id));
  const shortIds = shortIdsOf(rows.map((row) => row.id));
  const today = jstToday(now);
  return rows.map((row) => toReferencePost(row, shortIds.get(row.id), today));
}

/**
 * 参考の投稿を足す（まとめて。上限まで。送った順を保つため、足した日時を1ミリ秒ずつずらす）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param items 入力
 * @param now 今
 * @returns 足した参考の投稿
 * @throws {AppError} 上限（THREADS_ITEM_LIMIT）
 */
export async function createReferencePosts(
  db: Db,
  threadsAccountId: string,
  items: ReferencePostInput[],
  now: Date,
): Promise<ReferencePost[]> {
  const rows = await db.transaction(async (tx) => {
    await lockKey(tx, `threads_reference_post:${threadsAccountId}`);
    const [owned] = await tx
      .select({ total: count() })
      .from(threadsReferencePost)
      .where(eq(threadsReferencePost.threadsAccountId, threadsAccountId));
    if ((owned?.total ?? 0) + items.length > REFERENCE_POST_LIMIT)
      throw new AppError(THREADS_ERRORS.THREADS_ITEM_LIMIT);
    const base = now.getTime();
    return tx
      .insert(threadsReferencePost)
      .values(
        items.map((input, index) => ({
          threadsAccountId,
          ...referenceColumns(input),
          createdAt: new Date(base + index),
          updatedAt: new Date(base + index),
        })),
      )
      .returning();
  });
  const today = jstToday(now);
  return rows.map((row) => toReferencePost(row, undefined, today));
}

/**
 * 参考の投稿を直す（読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param id 参考の投稿の ID
 * @param input 入力
 * @param version 読んだ版
 * @param now 今
 * @returns 直した参考の投稿
 * @throws {AppError} ない（NOT_FOUND）・版が合わない（THREADS_VERSION_CONFLICT）
 */
export async function updateReferencePost(
  db: Db,
  threadsAccountId: string,
  id: string,
  input: ReferencePostInput,
  version: number,
  now: Date,
): Promise<ReferencePost> {
  const where = and(
    eq(threadsReferencePost.id, id),
    eq(threadsReferencePost.threadsAccountId, threadsAccountId),
  );
  const [row] = await db
    .update(threadsReferencePost)
    .set({ ...referenceColumns(input), version: sql`${threadsReferencePost.version} + 1` })
    .where(and(where, eq(threadsReferencePost.version, version)))
    .returning();
  if (row) return toReferencePost(row, undefined, jstToday(now));
  const [exists] = await db
    .select({ id: threadsReferencePost.id })
    .from(threadsReferencePost)
    .where(where);
  throw new AppError(exists ? THREADS_ERRORS.THREADS_VERSION_CONFLICT : "NOT_FOUND");
}

/**
 * 参考の投稿を消す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param id 参考の投稿の ID
 * @returns 消したなら true
 */
export async function deleteReferencePost(
  db: Db,
  threadsAccountId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(threadsReferencePost)
    .where(
      and(
        eq(threadsReferencePost.id, id),
        eq(threadsReferencePost.threadsAccountId, threadsAccountId),
      ),
    )
    .returning({ id: threadsReferencePost.id });
  return rows.length > 0;
}

/**
 * 解説のプロンプト（id を渡せばその1件、なければ解説がまだのものを鮮度の順に10件まで）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param strategy 戦略の値
 * @param id 1件だけのときの参考の投稿の ID
 * @param now 今
 * @returns プロンプトと、入れた参考の投稿と、解説がまだの数
 * @throws {AppError} id の参考の投稿がない（NOT_FOUND）
 */
export async function explainPrompt(
  db: Executor,
  threadsAccountId: string,
  strategy: StrategyValues,
  id: string | undefined,
  now: Date,
) {
  const posts = await listReferencePosts(db, threadsAccountId, now);
  const pending = posts.filter((post) => isBlank(post.whyGood));
  let chosen: ReferencePost[];
  if (id !== undefined) {
    const post = posts.find((item) => item.id === id);
    if (!post) throw new AppError("NOT_FOUND");
    chosen = [post];
  } else {
    chosen = sortForPrompt(pending, jstToday(now)).slice(0, EXPLAIN_BATCH_MAX);
  }
  return {
    prompt:
      chosen.length === 0 ? "" : buildExplainPrompt(chosen, strategy, { batch: id === undefined }),
    items: chosen.map((post) => ({ id: post.id, shortId: post.shortId })),
    pendingCount: pending.length,
  };
}

/**
 * 貼り戻した解説を保存する（解説が空の行だけを直し、ほかは飛ばす）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param items 参考の投稿の ID と解説
 * @returns 保存した ID と飛ばした ID
 */
export async function saveExplanations(
  db: Db,
  threadsAccountId: string,
  items: { id: string; whyGood: string }[],
): Promise<{
  saved: string[];
  skipped: { id: string; reason: "already_explained" | "not_found" }[];
}> {
  return db.transaction(async (tx) => {
    const saved: string[] = [];
    const skipped: { id: string; reason: "already_explained" | "not_found" }[] = [];
    for (const item of items) {
      const where = and(
        eq(threadsReferencePost.id, item.id),
        eq(threadsReferencePost.threadsAccountId, threadsAccountId),
      );
      const updated = await tx
        .update(threadsReferencePost)
        .set({ whyGood: item.whyGood, version: sql`${threadsReferencePost.version} + 1` })
        .where(and(where, sql`btrim(${threadsReferencePost.whyGood}) = ''`))
        .returning({ id: threadsReferencePost.id });
      if (updated.length > 0) {
        saved.push(item.id);
        continue;
      }
      const [exists] = await tx
        .select({ id: threadsReferencePost.id })
        .from(threadsReferencePost)
        .where(where);
      skipped.push({ id: item.id, reason: exists ? "already_explained" : "not_found" });
    }
    return { saved, skipped };
  });
}

/**
 * プロンプトに入れる参考の投稿（鮮度の順に10件）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 参考の投稿
 */
export async function listPromptReferencePosts(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<PromptReferencePost[]> {
  const today = jstToday(now);
  const posts = await listReferencePosts(db, threadsAccountId, now);
  return sortForPrompt(
    posts.map((post) => ({ ...post, createdAt: new Date(post.createdAt) })),
    today,
  )
    .slice(0, PROMPT_REFERENCE_POSTS)
    .map((post) => ({
      body: post.body,
      keyword: post.keyword,
      whyGood: post.whyGood,
      platform: post.platform,
      metrics: post.metrics,
      freshness: post.freshness,
    }));
}

// ---- リサーチのキーワード ----

/**
 * キーワードの行を返す形にする。
 * @param row 行
 * @returns キーワード
 */
function toKeyword(row: KeywordRow): ResearchKeyword {
  return {
    id: row.id,
    keyword: row.keyword,
    purpose: row.purpose,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * キーワードの一覧（足した新しい順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns キーワード
 */
export async function listKeywords(
  db: Executor,
  threadsAccountId: string,
): Promise<ResearchKeyword[]> {
  const rows = await db
    .select()
    .from(threadsResearchKeyword)
    .where(eq(threadsResearchKeyword.threadsAccountId, threadsAccountId))
    .orderBy(desc(threadsResearchKeyword.createdAt), desc(threadsResearchKeyword.id));
  return rows.map(toKeyword);
}

/**
 * 同じキーワードの一意の制約の違反を、領域のエラーにする。
 * @param run 書きこみ
 * @returns 書きこみの結果
 * @throws {AppError} 同じキーワード（THREADS_KEYWORD_DUPLICATE）
 */
async function withDuplicateCheck<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(THREADS_ERRORS.THREADS_KEYWORD_DUPLICATE);
    throw error;
  }
}

/**
 * キーワードを足す（まとめて。上限まで。同じものがあれば 409 で、どれも足さない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param items 入力
 * @param now 今
 * @returns 足したキーワード
 * @throws {AppError} 上限（THREADS_ITEM_LIMIT）・同じキーワード（THREADS_KEYWORD_DUPLICATE）
 */
export async function createKeywords(
  db: Db,
  threadsAccountId: string,
  items: ResearchKeywordInput[],
  now: Date,
): Promise<ResearchKeyword[]> {
  const normalized = items.map((item) => normalizeKeyword(item.keyword));
  if (new Set(normalized).size !== normalized.length)
    throw new AppError(THREADS_ERRORS.THREADS_KEYWORD_DUPLICATE);
  return withDuplicateCheck(() =>
    db.transaction(async (tx) => {
      await lockKey(tx, `threads_research_keyword:${threadsAccountId}`);
      const [owned] = await tx
        .select({ total: count() })
        .from(threadsResearchKeyword)
        .where(eq(threadsResearchKeyword.threadsAccountId, threadsAccountId));
      if ((owned?.total ?? 0) + items.length > KEYWORD_LIMIT)
        throw new AppError(THREADS_ERRORS.THREADS_ITEM_LIMIT);
      const base = now.getTime();
      const rows = await tx
        .insert(threadsResearchKeyword)
        .values(
          items.map((item, index) => ({
            threadsAccountId,
            keyword: item.keyword,
            keywordNormalized: normalized[index] ?? normalizeKeyword(item.keyword),
            purpose: item.purpose,
            createdAt: new Date(base + index),
            updatedAt: new Date(base + index),
          })),
        )
        .returning();
      return rows.map(toKeyword);
    }),
  );
}

/**
 * キーワードを直す（読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param id キーワードの ID
 * @param input 入力
 * @param version 読んだ版
 * @returns 直したキーワード
 * @throws {AppError} ない・版が合わない・同じキーワード
 */
export async function updateKeyword(
  db: Db,
  threadsAccountId: string,
  id: string,
  input: ResearchKeywordInput,
  version: number,
): Promise<ResearchKeyword> {
  const where = and(
    eq(threadsResearchKeyword.id, id),
    eq(threadsResearchKeyword.threadsAccountId, threadsAccountId),
  );
  const [row] = await withDuplicateCheck(() =>
    db
      .update(threadsResearchKeyword)
      .set({
        keyword: input.keyword,
        keywordNormalized: normalizeKeyword(input.keyword),
        purpose: input.purpose,
        version: sql`${threadsResearchKeyword.version} + 1`,
      })
      .where(and(where, eq(threadsResearchKeyword.version, version)))
      .returning(),
  );
  if (row) return toKeyword(row);
  const [exists] = await db
    .select({ id: threadsResearchKeyword.id })
    .from(threadsResearchKeyword)
    .where(where);
  throw new AppError(exists ? THREADS_ERRORS.THREADS_VERSION_CONFLICT : "NOT_FOUND");
}

/**
 * キーワードを消す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param id キーワードの ID
 * @returns 消したなら true
 */
export async function deleteKeyword(
  db: Db,
  threadsAccountId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(threadsResearchKeyword)
    .where(
      and(
        eq(threadsResearchKeyword.id, id),
        eq(threadsResearchKeyword.threadsAccountId, threadsAccountId),
      ),
    )
    .returning({ id: threadsResearchKeyword.id });
  return rows.length > 0;
}
