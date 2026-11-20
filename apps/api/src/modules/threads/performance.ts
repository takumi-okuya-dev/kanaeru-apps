// 反応の画面のデータ・改善のメモ・書き出し（threads-003。めぐるの metrics/performance-service.ts を写した）。
// 一覧は投稿した新しい順に最大 PERFORMANCE_LIST_MAX 件（めぐるのページ送りの代わり【仮決め】）。
import {
  PERFORMANCE_BASELINE_SAMPLE,
  PERFORMANCE_LIST_MAX,
  PERFORMANCE_MIN_JUDGEABLE,
  PROMPT_POOR_POSTS,
  THREADS_ERRORS,
  confirmAtOf,
  median,
} from "@workspace/contracts/threads";
import type {
  FeedbackInput,
  MetricsState,
  PerformanceItem,
  PerformanceSummary,
  PerformanceTab,
  PromptPoorPost,
} from "@workspace/contracts/threads";
import { buildCsv } from "@workspace/csv";
import { jstDateTime } from "@workspace/contracts/core";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { ThreadsAccountRecord } from "./repository.ts";
import {
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
 * 反応の画面（集計と一覧）。
 * @param db DB
 * @param account 運用アカウント
 * @param tab 絞りこみ
 * @returns 集計と一覧
 */
export async function getPerformanceView(
  db: Executor,
  account: ThreadsAccountRecord,
  tab: PerformanceTab,
) {
  const [summary, rows, poor] = await Promise.all([
    getSummary(db, account),
    selectItems(db)
      .where(
        and(
          eq(threadsPostDraft.threadsAccountId, account.id),
          eq(threadsPostDraft.status, "published"),
          tabFilter(tab),
        ),
      )
      .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
      .limit(PERFORMANCE_LIST_MAX),
    listPoorForPrompt(db, account.id),
  ]);
  const inPrompt = new Set(poor.map((item) => item.id));
  return { summary, items: rows.map((row) => toItem(row, inPrompt)) };
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
 * 数を CSV の欄にする（ない数は空）。
 * @param value 数
 * @returns 欄
 */
function cell(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * 日時を CSV の欄にする（日本時間。ないときは空）。
 * @param value 日時
 * @returns 欄
 */
function time(value: Date | null | undefined): string {
  return value ? jstDateTime(value) : "";
}

/** 判定の見える名前（CSV）。 */
const JUDGMENT_TEXT: Record<string, string> = { good: "好調", normal: "普通", poor: "低調" };

/** 取りこみの状態の見える名前（CSV）。 */
const STATE_TEXT: Record<string, string> = {
  updating: "途中",
  confirmed: "確定",
  late_confirmed: "遅れて確定",
  unmeasurable: "計れない",
};

/** 時点の見える名前（CSV）。 */
const KIND_TEXT: Record<string, string> = {
  h24: "24時間",
  d3: "3日",
  d7: "7日",
  late: "遅れて確定",
};

/**
 * 反応の CSV を作る（投稿ごと・取りこみごと。UTF-8 の BOM つき・式として読まれない守りは @workspace/csv）。
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
        body: threadsPostDraft.body,
        followers: sql<
          number | null
        >`(SELECT ${threadsFollowerSnapshot.followersCount} FROM ${threadsFollowerSnapshot}
          WHERE ${threadsFollowerSnapshot.threadsAccountId} = ${threadsPostMetricSnapshot.threadsAccountId}
            AND ${threadsFollowerSnapshot.snapshotDate} = (${threadsPostMetricSnapshot.fetchedAt} AT TIME ZONE 'Asia/Tokyo')::date)`,
      })
      .from(threadsPostMetricSnapshot)
      .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetricSnapshot.draftId))
      .where(eq(threadsPostMetricSnapshot.threadsAccountId, threadsAccountId))
      .orderBy(desc(threadsPostMetricSnapshot.fetchedAt), asc(threadsPostMetricSnapshot.id));
    return buildCsv(
      [
        "投稿の日時",
        "本文",
        "取りこんだ日時",
        "経過（分）",
        "時点",
        "取り方",
        "閲覧",
        "いいね",
        "返信",
        "リポスト",
        "引用",
        "シェア",
        "その日のフォロワー",
      ],
      rows.map(({ snapshot, publishedAt, body, followers }) => [
        time(publishedAt),
        body,
        time(snapshot.fetchedAt),
        String(snapshot.elapsedMinutes),
        KIND_TEXT[snapshot.kind] ?? snapshot.kind,
        snapshot.method === "slot" ? "時点の幅" : "補い",
        cell(snapshot.views),
        cell(snapshot.likes),
        cell(snapshot.replies),
        cell(snapshot.reposts),
        cell(snapshot.quotes),
        cell(snapshot.shares),
        cell(followers === null ? null : Number(followers)),
      ]),
    );
  }
  const h24 = alias(threadsPostMetricSnapshot, "h24");
  const rows = await db
    .select({
      draft: threadsPostDraft,
      metric: threadsPostMetric,
      h24Views: h24.views,
      followers: sql<
        number | null
      >`(SELECT ${threadsFollowerSnapshot.followersCount} FROM ${threadsFollowerSnapshot}
        WHERE ${threadsFollowerSnapshot.threadsAccountId} = ${threadsPostDraft.threadsAccountId}
          AND ${threadsFollowerSnapshot.capturedAt} <= ${threadsPostDraft.publishedAt}
        ORDER BY ${threadsFollowerSnapshot.capturedAt} DESC LIMIT 1)`,
    })
    .from(threadsPostDraft)
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
    [
      "投稿の日時",
      "本文",
      "Threads の URL",
      "状態",
      "判定",
      "倍率",
      "閲覧",
      "いいね",
      "返信",
      "リポスト",
      "引用",
      "シェア",
      "24時間の閲覧",
      "投稿のときのフォロワー",
      "時刻（0時からの分）",
      "次に投稿する",
      "持ち越し",
      "承認の日時",
    ],
    rows.map(({ draft, metric, h24Views, followers }) => [
      time(draft.publishedAt),
      draft.body,
      draft.threadsPermalink ?? "",
      metric ? (STATE_TEXT[metric.state] ?? metric.state) : "取りこみ待ち",
      metric?.judgment ? (JUDGMENT_TEXT[metric.judgment] ?? "") : "",
      metric?.judgment && metric.judgmentRatio !== null ? metric.judgmentRatio.toFixed(2) : "",
      cell(metric?.views),
      cell(metric?.likes),
      cell(metric?.replies),
      cell(metric?.reposts),
      cell(metric?.quotes),
      cell(metric?.shares),
      cell(h24Views),
      cell(followers === null ? null : Number(followers)),
      cell(draft.publishedSlotMinute),
      draft.publishedPrioritized === null ? "" : draft.publishedPrioritized ? "はい" : "いいえ",
      draft.publishedCarryover === null ? "" : draft.publishedCarryover ? "はい" : "いいえ",
      time(draft.reviewedAt),
    ]),
  );
}
