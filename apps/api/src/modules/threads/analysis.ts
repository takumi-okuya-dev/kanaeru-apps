// アルゴリズムの分析（threads-006。めぐるの metrics/analysis-service.ts を写した）。
// 材料は反応の分析（threads-003）で取りためた確定した投稿だけ。計算は約束の analyzePosts で、読むたびに行い保存しない。
// アプリの中で AI を呼ばない（内容の分類は、外の AI に貼るプロンプトと貼り戻した答えで付ける。AD-20）。
import {
  ANALYSIS_CLASSIFY_BATCH,
  ANALYSIS_PERIOD_DAYS,
  THREADS_ERRORS,
  analyzePosts,
  jstToday,
  minutesToTime,
  trendsForPrompt,
} from "@workspace/contracts/threads";
import type {
  AnalysisPost,
  AnalysisScope,
  AnalysisSettings,
  AnalysisSettingsInput,
  AnalysisTheme,
  AnalysisView,
  ClassificationsInput,
  ClassificationsList,
  PostLengthSettings,
  PromptTrend,
} from "@workspace/contracts/threads";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { readPostingSchedule } from "./posting-schedule.ts";
import {
  threadsAnalysisSetting,
  threadsPostClassification,
  threadsPostDraft,
  threadsPostMetric,
  threadsPostMetricSnapshot,
  threadsPromotion,
} from "./schema.ts";

const DAY_MS = 86_400_000;

/** 分類済みの一覧で返す件数。 */
const CLASSIFIED_LIST_LIMIT = 200;

/**
 * 分析の期間（日本時間の今日から89日前の0時以降）。
 * @param now 今
 * @returns 始めの日・終わりの日（YYYY-MM-DD）・始めの日時・日数
 */
export function analysisPeriod(now: Date) {
  const to = jstToday(now);
  const from = jstToday(
    new Date(new Date(`${to}T00:00:00+09:00`).getTime() - (ANALYSIS_PERIOD_DAYS - 1) * DAY_MS),
  );
  return { from, to, since: new Date(`${from}T00:00:00+09:00`), days: ANALYSIS_PERIOD_DAYS };
}

/**
 * 期間の確定した投稿の条件（遅れて確定・計れないは使わない）。
 * @param threadsAccountId 運用アカウントの ID
 * @param since 期間の始め
 * @returns 条件
 */
function confirmedInPeriod(threadsAccountId: string, since: Date): SQL | undefined {
  return and(
    eq(threadsPostDraft.threadsAccountId, threadsAccountId),
    eq(threadsPostDraft.status, "published"),
    gte(threadsPostDraft.publishedAt, since),
    eq(threadsPostMetric.state, "confirmed"),
  );
}

/**
 * 宣伝の投稿かを見分ける関数（本文に宣伝のタイトルか URL があれば宣伝の投稿）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 本文を受け取って、宣伝の投稿なら true を返す関数
 */
async function promoMatcher(db: Executor, threadsAccountId: string) {
  const rows = await db
    .select({ title: threadsPromotion.title, linkedUrl: threadsPromotion.linkedUrl })
    .from(threadsPromotion)
    .where(eq(threadsPromotion.threadsAccountId, threadsAccountId));
  const needles = rows
    .flatMap((row) => [row.title.trim(), row.linkedUrl.trim()])
    .filter((value) => value !== "");
  return (body: string) => needles.some((needle) => body.includes(needle));
}

/**
 * 分析の材料を1回で読む（24時間の値・投稿した時点のフォロワーの数・分類を結ぶ）。
 * 時間差のメンションの返信（自分の返信）は、反応の返信の数から引く。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 確定した投稿（投稿した新しい順）
 */
export async function loadAnalysisPosts(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<AnalysisPost[]> {
  const { since } = analysisPeriod(now);
  const h24 = alias(threadsPostMetricSnapshot, "h24");
  const [rows, isPromo] = await Promise.all([
    db
      .select({
        id: threadsPostDraft.id,
        body: threadsPostDraft.body,
        publishedAt: threadsPostDraft.publishedAt,
        views: threadsPostMetric.views,
        likes: threadsPostMetric.likes,
        replies: threadsPostMetric.replies,
        reposts: threadsPostMetric.reposts,
        quotes: threadsPostMetric.quotes,
        // 投稿した日時より前で最も新しいフォロワーの数
        followersAtPost: sql<
          number | null
        >`(SELECT f.followers_count FROM threads_follower_snapshot f
          WHERE f.threads_account_id = ${threadsPostDraft.threadsAccountId} AND f.captured_at <= ${threadsPostDraft.publishedAt}
          ORDER BY f.captured_at DESC LIMIT 1)`,
        h24Views: h24.views,
        openingType: threadsPostClassification.openingType,
        themeId: threadsPostClassification.themeId,
        // 時間差のメンションの返信（自分の返信）が反応の取りこみより前に出ていれば1（threads-007。返信率から除く）
        ownReplies: sql<number>`(SELECT count(*)::int FROM threads_post_mention m
          WHERE m.draft_id = ${threadsPostDraft.id} AND m.state = 'sent' AND m.sent_at <= ${threadsPostMetric.lastFetchedAt})`,
      })
      .from(threadsPostDraft)
      .innerJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
      .leftJoin(h24, and(eq(h24.draftId, threadsPostDraft.id), eq(h24.kind, "h24")))
      .leftJoin(
        threadsPostClassification,
        eq(threadsPostClassification.draftId, threadsPostDraft.id),
      )
      .where(confirmedInPeriod(threadsAccountId, since))
      .orderBy(desc(threadsPostDraft.publishedAt), desc(threadsPostDraft.id)),
    promoMatcher(db, threadsAccountId),
  ]);
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    views: row.views ?? 0,
    likes: row.likes ?? 0,
    replies: Math.max(0, (row.replies ?? 0) - Number(row.ownReplies)),
    reposts: row.reposts ?? 0,
    quotes: row.quotes ?? 0,
    followersAtPost: row.followersAtPost === null ? null : Number(row.followersAtPost),
    h24Views: row.h24Views,
    openingType: row.openingType,
    themeId: row.themeId,
    promo: isPromo(row.body),
  }));
}

/**
 * 分析の設定を読む。行がなければ初めの値（版 0）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 設定
 */
export async function readAnalysisSettings(
  db: Executor,
  threadsAccountId: string,
): Promise<AnalysisSettings> {
  const [row] = await db
    .select()
    .from(threadsAnalysisSetting)
    .where(eq(threadsAnalysisSetting.threadsAccountId, threadsAccountId))
    .limit(1);
  return row
    ? { trendsInPrompt: row.trendsInPrompt, themes: row.themes, version: row.version }
    : { trendsInPrompt: true, themes: [], version: 0 };
}

/**
 * プロンプトに入れる傾向（設定が入のとき、ふだんの投稿〈宣伝を除く〉で求め、投稿のルールと NG ワードで選ぶ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param lengthSettings 文字数の設定
 * @param coreRules 投稿のルールの空でない行
 * @param ngWords NG ワード
 * @param now 今
 * @returns 入れる傾向（なければ []）
 */
export async function trendsForAccountPrompt(
  db: Executor,
  threadsAccountId: string,
  lengthSettings: PostLengthSettings,
  coreRules: readonly string[],
  ngWords: readonly string[],
  now: Date,
): Promise<PromptTrend[]> {
  const settings = await readAnalysisSettings(db, threadsAccountId);
  if (!settings.trendsInPrompt) return [];
  const posts = (await loadAnalysisPosts(db, threadsAccountId, now)).filter((post) => !post.promo);
  const { trends } = analyzePosts(posts, { lengthSettings, themes: settings.themes });
  return trendsForPrompt(trends, coreRules, ngWords).map((trend) => ({
    text: trend.text,
    count: trend.count,
    ratio: trend.ratio,
  }));
}

/** 分析の画面を作るのに要るもの。 */
export type AnalysisViewInput = {
  threadsAccountId: string;
  scope: AnalysisScope;
  lengthSettings: PostLengthSettings;
  coreRules: readonly string[];
  ngWords: readonly string[];
  now: Date;
};

/**
 * 分析の画面のデータ。
 * @param db DB
 * @param input 運用アカウント・範囲・文字数の設定・投稿のルール・NG ワード・今
 * @returns 画面のデータ
 */
export async function getAnalysisView(
  db: Executor,
  input: AnalysisViewInput,
): Promise<AnalysisView> {
  const [posts, settings, schedule] = await Promise.all([
    loadAnalysisPosts(db, input.threadsAccountId, input.now),
    readAnalysisSettings(db, input.threadsAccountId),
    readPostingSchedule(db, input.threadsAccountId),
  ]);
  const used = input.scope === "regular" ? posts.filter((post) => !post.promo) : posts;
  const result = analyzePosts(used, {
    lengthSettings: input.lengthSettings,
    themes: settings.themes,
  });
  // 次のプロンプトに入る傾向は、範囲によらず「ふだんの投稿」で求める（プロンプトと同じ）
  const regular = analyzePosts(
    posts.filter((post) => !post.promo),
    { lengthSettings: input.lengthSettings, themes: settings.themes },
  );
  const inPrompt = settings.trendsInPrompt
    ? new Set(
        trendsForPrompt(regular.trends, input.coreRules, input.ngWords).map(
          (trend) => `${trend.dimension}:${trend.key}`,
        ),
      )
    : new Set<string>();
  const { from, to, days } = analysisPeriod(input.now);
  return {
    period: { from, to, days },
    scope: input.scope,
    ...result,
    trends: result.trends.map((trend) => ({
      ...trend,
      inPrompt: inPrompt.has(`${trend.dimension}:${trend.key}`),
    })),
    // 宣伝の投稿の数は、範囲によらず期間の全体で数える
    totals: { ...result.totals, promo: posts.filter((post) => post.promo).length },
    schedule: {
      enabled: schedule?.enabled ?? false,
      slotTimes: (schedule?.slotMinutes ?? []).map(minutesToTime),
    },
    settings,
  };
}

/**
 * 新しいテーマの ID（`t`＋英数字8文字）。
 * @param used 使っている ID
 * @returns ID
 */
function newThemeId(used: ReadonlySet<string>): string {
  for (;;) {
    const id = `t${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
}

/**
 * 分析の設定を保存する（読んだ版と同じときだけ）。消したテーマの分類は、同じトランザクションでテーマなしにする。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param input 入力
 * @returns 保存した設定
 * @throws {AppError} 版が合わないとき（THREADS_VERSION_CONFLICT）
 */
export async function saveAnalysisSettings(
  db: Db,
  threadsAccountId: string,
  input: AnalysisSettingsInput,
): Promise<AnalysisSettings> {
  return db.transaction(async (tx) => {
    const current = await readAnalysisSettings(tx, threadsAccountId);
    if (current.version !== input.version)
      throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    const known = new Set(current.themes.map((theme) => theme.id));
    const used = new Set<string>();
    const themes: AnalysisTheme[] = input.themes.map((theme) => {
      const id =
        theme.id && known.has(theme.id) && !used.has(theme.id)
          ? theme.id
          : newThemeId(new Set([...known, ...used]));
      used.add(id);
      return { id, name: theme.name };
    });
    const removed = current.themes.map((theme) => theme.id).filter((id) => !used.has(id));
    if (removed.length > 0) {
      await tx
        .update(threadsPostClassification)
        .set({ themeId: null })
        .where(
          and(
            eq(threadsPostClassification.threadsAccountId, threadsAccountId),
            inArray(threadsPostClassification.themeId, removed),
          ),
        );
    }
    const values = { trendsInPrompt: input.trendsInPrompt, themes };
    const [row] =
      input.version === 0
        ? await tx
            .insert(threadsAnalysisSetting)
            .values({ threadsAccountId, ...values })
            .onConflictDoNothing()
            .returning()
        : await tx
            .update(threadsAnalysisSetting)
            .set({ ...values, version: sql`${threadsAnalysisSetting.version} + 1` })
            .where(
              and(
                eq(threadsAnalysisSetting.threadsAccountId, threadsAccountId),
                eq(threadsAnalysisSetting.version, input.version),
              ),
            )
            .returning();
    if (!row) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    return { trendsInPrompt: row.trendsInPrompt, themes: row.themes, version: row.version };
  });
}

/**
 * 分類する・直す投稿の一覧。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param mode まだの投稿（新しい50件）・分類済み（新しい200件）
 * @param now 今
 * @returns 投稿・残りの数・テーマ
 */
export async function listClassificationTargets(
  db: Executor,
  threadsAccountId: string,
  mode: "unclassified" | "classified",
  now: Date,
): Promise<ClassificationsList> {
  const { since } = analysisPeriod(now);
  const where = and(
    confirmedInPeriod(threadsAccountId, since),
    mode === "unclassified"
      ? isNull(threadsPostClassification.draftId)
      : isNotNull(threadsPostClassification.draftId),
  );
  const limit = mode === "unclassified" ? ANALYSIS_CLASSIFY_BATCH : CLASSIFIED_LIST_LIMIT;
  const base = () =>
    db
      .select({
        draftId: threadsPostDraft.id,
        body: threadsPostDraft.body,
        publishedAt: threadsPostDraft.publishedAt,
        openingType: threadsPostClassification.openingType,
        themeId: threadsPostClassification.themeId,
        total: sql<number>`count(*) OVER ()`.mapWith(Number),
      })
      .from(threadsPostDraft)
      .innerJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
      .leftJoin(
        threadsPostClassification,
        eq(threadsPostClassification.draftId, threadsPostDraft.id),
      );
  const [rows, settings] = await Promise.all([
    base()
      .where(where)
      .orderBy(desc(threadsPostDraft.publishedAt), desc(threadsPostDraft.id))
      .limit(limit),
    readAnalysisSettings(db, threadsAccountId),
  ]);
  return {
    posts: rows.map((row) => ({
      draftId: row.draftId,
      body: row.body,
      publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
      openingType: row.openingType,
      themeId: row.themeId,
    })),
    remaining: Math.max(0, (rows[0]?.total ?? 0) - rows.length),
    themes: settings.themes,
  };
}

/**
 * 分類を保存する。その運用アカウントの期間の確定した投稿でないもの・知らないテーマは保存しない。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param input 入力
 * @param now 今
 * @returns 保存した数と、保存しなかった案の ID
 */
export async function saveClassifications(
  db: Db,
  threadsAccountId: string,
  input: ClassificationsInput,
  now: Date,
): Promise<{ saved: number; skipped: string[] }> {
  const { since } = analysisPeriod(now);
  const ids = [...new Set(input.items.map((item) => item.draftId))];
  return db.transaction(async (tx) => {
    const [targets, settings] = await Promise.all([
      tx
        .select({ id: threadsPostDraft.id })
        .from(threadsPostDraft)
        .innerJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
        .where(and(confirmedInPeriod(threadsAccountId, since), inArray(threadsPostDraft.id, ids))),
      readAnalysisSettings(tx, threadsAccountId),
    ]);
    const ok = new Set(targets.map((target) => target.id));
    const themeIds = new Set(settings.themes.map((theme) => theme.id));
    const skipped = new Set<string>();
    const rows = new Map<string, ClassificationsInput["items"][number]>();
    for (const item of input.items) {
      if (!ok.has(item.draftId) || (item.themeId !== null && !themeIds.has(item.themeId)))
        skipped.add(item.draftId);
      else rows.set(item.draftId, item);
    }
    if (rows.size > 0) {
      await tx
        .insert(threadsPostClassification)
        .values(
          [...rows.values()].map((item) => ({
            draftId: item.draftId,
            threadsAccountId,
            openingType: item.openingType,
            themeId: item.themeId,
            source: input.source,
          })),
        )
        .onConflictDoUpdate({
          target: threadsPostClassification.draftId,
          set: {
            openingType: sql`excluded.opening_type`,
            themeId: sql`excluded.theme_id`,
            source: sql`excluded.source`,
            updatedAt: sql`now()`,
          },
        });
    }
    for (const id of rows.keys()) skipped.delete(id);
    return { saved: rows.size, skipped: [...skipped] };
  });
}
