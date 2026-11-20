// 反応の画面のデータ・改善のメモ・書き出し（threads-003。めぐるの metrics/performance-service.ts を写した）。
// 一覧は投稿した新しい順に PERFORMANCE_PAGE_SIZE 件ずつ（続きは nextCursor。threads-012 でめぐるのページ送りにそろえた）。
// CSV の列はめぐるの「投稿ごと」37列・「取りこみごと」13列（列と値の形は約束の performance-csv.ts）。
import {
  PERFORMANCE_BASELINE_SAMPLE,
  PERFORMANCE_MIN_JUDGEABLE,
  PERFORMANCE_PAGE_SIZE,
  POST_CSV_HEADER,
  PROMPT_POOR_POSTS,
  SNAPSHOT_CSV_HEADER,
  THREADS_ERRORS,
  confirmAtOf,
  median,
  postCsvCells,
  snapshotCsvCells,
} from "@workspace/contracts/threads";
import type {
  FeedbackInput,
  MetricValues,
  MetricsState,
  PerformanceItem,
  PerformanceSummary,
  PerformanceTab,
  PromptPoorPost,
} from "@workspace/contracts/threads";
import { buildCsv } from "@workspace/csv";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { decodeCursor, encodeCursor } from "./drafts.ts";
import type { ThreadsAccountRecord } from "./repository.ts";
import {
  threadsDraftBatch,
  threadsFollowerSnapshot,
  threadsPostDraft,
  threadsPostMetric,
  threadsPostMetricSnapshot,
} from "./schema.ts";

/**
 * プロンプトに入れる低調の投稿の条件（確定して低調で、「次のプロンプトに入れる」のまま、投稿済み）。
 * @param threadsAccountId 運用アカウントの ID
 * @returns 条件
 */
function poorForPrompt(threadsAccountId: string): SQL | undefined {
  return and(
    eq(threadsPostMetric.threadsAccountId, threadsAccountId),
    eq(threadsPostMetric.judgment, "poor"),
    eq(threadsPostMetric.includeInPrompt, true),
    inArray(threadsPostMetric.state, ["confirmed", "late_confirmed"]),
    eq(threadsPostDraft.status, "published"),
  );
}

/**
 * プロンプトに入れる低調の投稿（投稿した新しい順に5件）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 本文とメモ（と ID）
 */
export async function listPoorForPrompt(
  db: Executor,
  threadsAccountId: string,
): Promise<(PromptPoorPost & { id: string })[]> {
  return db
    .select({
      id: threadsPostDraft.id,
      body: threadsPostDraft.body,
      memo: threadsPostMetric.feedbackMemo,
    })
    .from(threadsPostMetric)
    .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetric.draftId))
    .where(poorForPrompt(threadsAccountId))
    .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
    .limit(PROMPT_POOR_POSTS);
}

/**
 * 一覧の絞りこみの条件。
 * @param tab 絞りこみ
 * @returns 条件（すべては undefined）
 */
function tabFilter(tab: PerformanceTab): SQL | undefined {
  if (tab === "all") return undefined;
  if (tab === "pending")
    return or(isNull(threadsPostMetric.draftId), eq(threadsPostMetric.state, "updating"));
  return eq(threadsPostMetric.judgment, tab);
}

/**
 * 一覧の行の列（案と反応を結ぶ）。
 * @param db DB
 * @returns where・orderBy をつなげる問い合わせ
 */
function selectItems(db: Executor) {
  return db
    .select({
      id: threadsPostDraft.id,
      body: threadsPostDraft.body,
      publishedAt: threadsPostDraft.publishedAt,
      permalink: threadsPostDraft.threadsPermalink,
      metric: threadsPostMetric,
    })
    .from(threadsPostDraft)
    .leftJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id));
}

/** 一覧の行。 */
type ItemRow = Awaited<ReturnType<ReturnType<typeof selectItems>["where"]>>[number];

/**
 * 一覧の行を、返す形にする。
 * @param row 行
 * @param inPrompt 次のプロンプトに入る案の ID
 * @returns 投稿ごとの反応
 */
function toItem(row: ItemRow, inPrompt: ReadonlySet<string>): PerformanceItem {
  const publishedAt = row.publishedAt ?? new Date(0);
  const metric = row.metric;
  const state: MetricsState = metric?.state ?? "pending";
  const confirmed = state === "confirmed" || state === "late_confirmed";
  return {
    id: row.id,
    body: row.body,
    publishedAt: publishedAt.toISOString(),
    threadsPermalink: row.permalink,
    state,
    metrics: metric?.lastFetchedAt
      ? {
          views: metric.views,
          likes: metric.likes,
          replies: metric.replies,
          reposts: metric.reposts,
          quotes: metric.quotes,
          shares: metric.shares,
        }
      : null,
    lastFetchedAt: metric?.lastFetchedAt ? metric.lastFetchedAt.toISOString() : null,
    lastElapsedHours:
      metric?.lastElapsedMinutes == null ? null : Math.floor(metric.lastElapsedMinutes / 60),
    confirmAt:
      confirmed || state === "unmeasurable" ? null : confirmAtOf(publishedAt).toISOString(),
    judgment: confirmed ? (metric?.judgment ?? null) : null,
    ratio: confirmed && metric?.judgment ? metric.judgmentRatio : null,
    unmeasurableReason: metric?.unmeasurableReason ?? null,
    feedback:
      confirmed && metric?.judgment === "poor"
        ? {
            memo: metric.feedbackMemo,
            includeInPrompt: metric.includeInPrompt,
            inNextPrompt: inPrompt.has(row.id),
            version: metric.feedbackVersion,
          }
        : null,
  };
}

/**
 * 反応の画面の上の集計。
 * @param db DB
 * @param account 運用アカウント
 * @returns 集計
 */
async function getSummary(
  db: Executor,
  account: ThreadsAccountRecord,
): Promise<PerformanceSummary> {
  const [sample, [counts], [latest]] = await Promise.all([
    db
      .select({ views: threadsPostMetric.views })
      .from(threadsPostMetric)
      .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetric.draftId))
      .where(
        and(
          eq(threadsPostMetric.threadsAccountId, account.id),
          eq(threadsPostMetric.state, "confirmed"),
          isNotNull(threadsPostMetric.views),
        ),
      )
      .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
      .limit(PERFORMANCE_BASELINE_SAMPLE),
    db
      .select({
        all: count(),
        good: sql<number>`count(*) FILTER (WHERE ${threadsPostMetric.judgment} = 'good')`.mapWith(
          Number,
        ),
        normal:
          sql<number>`count(*) FILTER (WHERE ${threadsPostMetric.judgment} = 'normal')`.mapWith(
            Number,
          ),
        poor: sql<number>`count(*) FILTER (WHERE ${threadsPostMetric.judgment} = 'poor')`.mapWith(
          Number,
        ),
        pending:
          sql<number>`count(*) FILTER (WHERE ${threadsPostMetric.draftId} IS NULL OR ${threadsPostMetric.state} = 'updating')`.mapWith(
            Number,
          ),
      })
      .from(threadsPostDraft)
      .leftJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, account.id),
          eq(threadsPostDraft.status, "published"),
        ),
      ),
    db
      .select({ at: max(threadsPostMetric.lastFetchedAt) })
      .from(threadsPostMetric)
      .where(eq(threadsPostMetric.threadsAccountId, account.id)),
  ]);
  const values = sample.flatMap((row) => (row.views === null ? [] : [row.views]));
  const baseline = median(values);
  const enough = values.length >= PERFORMANCE_MIN_JUDGEABLE;
  return {
    baseline: enough ? baseline : null,
    baselineSampleCount: values.length,
    baselineIsZero: enough && baseline === 0,
    lastFetchedAt: latest?.at ? latest.at.toISOString() : null,
    insightsDenied: account.insightsDeniedAt !== null,
    connectionStatus: account.connectionStatus,
    counts: {
      all: counts?.all ?? 0,
      good: counts?.good ?? 0,
      normal: counts?.normal ?? 0,
      poor: counts?.poor ?? 0,
      pending: counts?.pending ?? 0,
    },
  };
}

/**
 * 続きの位置の条件（投稿した日時が前、同じ日時なら ID が後）。
 * @param before 前の応答の nextCursor
 * @returns 条件（はじめは undefined）
 * @throws {AppError} 続きの位置が読めないとき（INVALID_INPUT。欄は before）
 */
function afterCursor(before: string | undefined): SQL | undefined {
  if (!before) return undefined;
  const cursor = decodeCursor(before);
  if (!cursor) {
    throw new AppError("INVALID_INPUT", {
      fields: [
        { path: "before", message: "続きの位置が読めません。一覧を読みこみ直してください。" },
      ],
    });
  }
  const at = cursor.publishedAt.toISOString();
  return sql`(${threadsPostDraft.publishedAt} < ${at}
    OR (${threadsPostDraft.publishedAt} = ${at} AND ${threadsPostDraft.id} > ${cursor.id}))`;
}

/**
 * 反応の画面（集計と一覧の1ページ。めぐるの listPerformancePage）。
 * @param db DB
 * @param account 運用アカウント
 * @param tab 絞りこみ
 * @param before 続きを読むときの、前の応答の nextCursor
 * @returns 集計と一覧と、続きの位置
 */
export async function getPerformanceView(
  db: Executor,
  account: ThreadsAccountRecord,
  tab: PerformanceTab,
  before?: string,
) {
  const cursor = afterCursor(before);
  const [summary, rows, poor] = await Promise.all([
    getSummary(db, account),
    selectItems(db)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, account.id),
          eq(threadsPostDraft.status, "published"),
          tabFilter(tab),
          cursor,
        ),
      )
      .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
      .limit(PERFORMANCE_PAGE_SIZE + 1),
    listPoorForPrompt(db, account.id),
  ]);
  const inPrompt = new Set(poor.map((item) => item.id));
  const page = rows.slice(0, PERFORMANCE_PAGE_SIZE);
  const last = page.at(-1);
  return {
    summary,
    items: page.map((row) => toItem(row, inPrompt)),
    nextCursor:
      rows.length > PERFORMANCE_PAGE_SIZE && last?.publishedAt
        ? encodeCursor(last.publishedAt, last.id)
        : null,
  };
}

/**
 * 低調の投稿の改善のメモと「次のプロンプトに入れる」を保存する（読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input 入力
 * @returns 保存したあとの項目
 * @throws {AppError} 低調で確定した投稿でない（NOT_FOUND）・版が合わない（THREADS_VERSION_CONFLICT）
 */
export async function updateFeedback(
  db: Executor,
  threadsAccountId: string,
  draftId: string,
  input: FeedbackInput,
): Promise<PerformanceItem> {
  const target = and(
    eq(threadsPostMetric.draftId, draftId),
    eq(threadsPostMetric.threadsAccountId, threadsAccountId),
    eq(threadsPostMetric.judgment, "poor"),
    inArray(threadsPostMetric.state, ["confirmed", "late_confirmed"]),
  );
  const updated = await db
    .update(threadsPostMetric)
    .set({
      feedbackMemo: input.memo ? input.memo : null,
      includeInPrompt: input.includeInPrompt,
      feedbackVersion: sql`${threadsPostMetric.feedbackVersion} + 1`,
      feedbackUpdatedAt: sql`now()`,
    })
    .where(and(target, eq(threadsPostMetric.feedbackVersion, input.version)))
    .returning({ id: threadsPostMetric.draftId });
  if (updated.length === 0) {
    const [current] = await db
      .select({ id: threadsPostMetric.draftId })
      .from(threadsPostMetric)
      .where(target);
    if (!current) throw new AppError("NOT_FOUND");
    throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
  }
  const [[row], poor] = await Promise.all([
    selectItems(db).where(eq(threadsPostDraft.id, draftId)).limit(1),
    listPoorForPrompt(db, threadsAccountId),
  ]);
  if (!row) throw new AppError("NOT_FOUND");
  return toItem(row, new Set(poor.map((item) => item.id)));
}

/**
 * 反応の6つの数を取り出す（取りこんでいなければ null）。
 * @param row 数を持つ行
 * @param fetched 取りこんだか
 * @returns 6つの数
 */
function metricsOf(
  row: {
    views: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
    shares: number | null;
  } | null,
  fetched: boolean,
): MetricValues | null {
  if (!row || !fetched) return null;
  return {
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    quotes: row.quotes,
    shares: row.shares,
  };
}

/**
 * 数かもしれない値を数にする（副問い合わせの数は文字で返ることがある）。
 * @param value 値
 * @returns 数（なければ null）
 */
function toNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * 反応の CSV を作る（投稿ごと・取りこみごと。列はめぐると同じ。UTF-8 の BOM つき・式として読まれない守りは @workspace/csv）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param kind posts：投稿ごと・snapshots：取りこみごと
 * @returns CSV の文字
 */
export async function buildPerformanceCsv(
  db: Executor,
  threadsAccountId: string,
  kind: "posts" | "snapshots",
): Promise<string> {
  if (kind === "snapshots") {
    const rows = await db
      .select({
        snapshot: threadsPostMetricSnapshot,
        publishedAt: threadsPostDraft.publishedAt,
        // 取りこんだ日（日本時間）のフォロワー数
        followers: sql<
          number | string | null
        >`(SELECT ${threadsFollowerSnapshot.followersCount} FROM ${threadsFollowerSnapshot}
          WHERE ${threadsFollowerSnapshot.threadsAccountId} = ${threadsPostMetricSnapshot.threadsAccountId}
            AND ${threadsFollowerSnapshot.snapshotDate} = (${threadsPostMetricSnapshot.fetchedAt} AT TIME ZONE 'Asia/Tokyo')::date)`,
      })
      .from(threadsPostMetricSnapshot)
      .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetricSnapshot.draftId))
      .where(eq(threadsPostMetricSnapshot.threadsAccountId, threadsAccountId))
      .orderBy(desc(threadsPostMetricSnapshot.fetchedAt), asc(threadsPostMetricSnapshot.id));
    return buildCsv(
      SNAPSHOT_CSV_HEADER,
      rows.map(({ snapshot, publishedAt, followers }) =>
        snapshotCsvCells({
          id: snapshot.draftId,
          publishedAt: publishedAt ?? new Date(0),
          fetchedAt: snapshot.fetchedAt,
          elapsedMinutes: snapshot.elapsedMinutes,
          kind: snapshot.kind,
          method: snapshot.method,
          metrics: metricsOf(snapshot, true)!,
          followersOnDay: toNumber(followers),
        }),
      ),
    );
  }
  const h24 = alias(threadsPostMetricSnapshot, "h24");
  const rows = await db
    .select({
      draft: threadsPostDraft,
      batch: threadsDraftBatch,
      metric: threadsPostMetric,
      h24,
      // 投稿した日時より前で、いちばん新しいフォロワー数
      followers: sql<
        number | string | null
      >`(SELECT ${threadsFollowerSnapshot.followersCount} FROM ${threadsFollowerSnapshot}
        WHERE ${threadsFollowerSnapshot.threadsAccountId} = ${threadsPostDraft.threadsAccountId}
          AND ${threadsFollowerSnapshot.capturedAt} <= ${threadsPostDraft.publishedAt}
        ORDER BY ${threadsFollowerSnapshot.capturedAt} DESC LIMIT 1)`,
    })
    .from(threadsPostDraft)
    .innerJoin(threadsDraftBatch, eq(threadsDraftBatch.id, threadsPostDraft.batchId))
    .leftJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
    .leftJoin(h24, and(eq(h24.draftId, threadsPostDraft.id), eq(h24.kind, "h24")))
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, threadsAccountId),
        eq(threadsPostDraft.status, "published"),
      ),
    )
    .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id));
  return buildCsv(
    POST_CSV_HEADER,
    rows.map(({ draft, batch, metric, h24: h24Row, followers }) =>
      postCsvCells({
        id: draft.id,
        publishedAt: draft.publishedAt ?? new Date(0),
        body: draft.body,
        metrics: metricsOf(metric, metric?.lastFetchedAt != null),
        ratio: metric?.judgment ? metric.judgmentRatio : null,
        state: metric?.state ?? "pending",
        judgment: metric?.judgment ?? null,
        permalink: draft.threadsPermalink,
        lastFetchedAt: metric?.lastFetchedAt ?? null,
        lastElapsedMinutes: metric?.lastElapsedMinutes ?? null,
        followersAtPost: toNumber(followers),
        h24: metricsOf(h24Row, h24Row !== null),
        batchId: batch.id,
        batchPosition: draft.position,
        batchCreatedAt: batch.createdAt,
        approvedAt: draft.reviewedAt,
        prioritized: draft.publishedPrioritized,
        carryover: draft.publishedCarryover,
        bodyEdited: draft.bodyEditedAt !== null,
        slotMinute: draft.publishedSlotMinute,
        strategyUpdatedAt: batch.strategyUpdatedAt,
        promotionsChangedAt: batch.promotionsChangedAt,
        researchChangedAt: batch.researchChangedAt,
        coreRulesChangedAt: batch.coreRulesChangedAt,
      }),
    ),
  );
}
