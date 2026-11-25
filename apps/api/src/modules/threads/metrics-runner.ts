// 反応の取りこみ（threads-003。めぐるの metrics/metrics-runner.ts を写した）。定期の仕事（job-runner.ts）の中で呼ぶ。
// - 投稿から24時間・3日・7日（前後1時間の幅）に反応の6つの数を取りこみ、7日で確定して判定する
// - 幅を過ぎた時点（DB の夜間の停止の間など）は、あとの回で「過ぎた時点のうち最も新しい1つ」を補う
//   （めぐるは日本時間3時に1日1回補ったが、kanaeru は3時に DB が止まっているので、毎回の残りの呼び出しの数で補う【仮決め】）
// - フォロワーの数は、運用アカウントごとに1日（日本時間）1回
// - 判定は、確定した投稿の新しい30件の閲覧の中央値を基準に、2倍以上で好調・0.5倍以下で低調（5件に足りなければ判定しない）
// Threads への呼び出しの数は、その回の公開の数から決める。失敗は1件・1つの運用アカウントの中で受け止める。
// ログは ID と数だけ。
import {
  FOLLOWER_ACTIVE_DAYS,
  METRICS_CALLS_PER_PUBLISH,
  METRICS_LATE_AFTER_HOURS,
  METRICS_MAX_CALLS_PER_TICK,
  PERFORMANCE_BASELINE_SAMPLE,
  PERFORMANCE_MIN_JUDGEABLE,
  catchUpKind,
  elapsedMinutes,
  jstDateOf,
  jstMidnight,
  judge,
  median,
  milestoneForElapsed,
} from "@workspace/contracts/threads";
import type { MetricsKindValue, MetricsMilestone } from "@workspace/contracts/threads";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { loadCredentials, markNeedsReconnect } from "./connection.ts";
import {
  threadsAccount,
  threadsFollowerSnapshot,
  threadsPostDraft,
  threadsPostMetric,
  threadsPostMetricSnapshot,
} from "./schema.ts";
import {
  ThreadsAuthError,
  ThreadsNotFoundError,
  ThreadsPermissionError,
  ThreadsRateLimitError,
} from "./threads-client.ts";
import type { ThreadsClient, ThreadsMediaInsights } from "./threads-client.ts";

/** 1回に対象を読む回数の上限（呼び出しの数に足りる仕事が見つかるまで、古い順に読み進める）。 */
const METRICS_MAX_PAGES = 5;

const HOUR_MS = 3600_000;

/** 取りこむ1件。 */
type Work = {
  draftId: string;
  threadsAccountId: string;
  mediaId: string | null;
  kind: MetricsKindValue | "no_media";
  method: "slot" | "daily";
  elapsed: number;
};

/**
 * 反応の取りこみを1回行う。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now 今
 * @param publishedThisTick この回に進めた公開の数（Threads への呼び出しの数を残す）
 * @returns 取りこんだ数（反応とフォロワーの数）
 */
export async function runMetricsStage(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date,
  publishedThisTick: number,
): Promise<number> {
  const { db, logger } = deps;
  let calls = METRICS_MAX_CALLS_PER_TICK - METRICS_CALLS_PER_PUBLISH * publishedThisTick;
  if (calls <= 0) return 0;
  const today = jstDateOf(now);
  const todayStart = jstMidnight(today);

  // 1. 対象：接続済みで、反応を読む権限がない印が今日より前の運用アカウントの、確定していない投稿済み（23時間より前）
  //    古い順に少しずつ読み、取る仕事が呼び出しの数に足りるまで（読む回数に上限をつけて）先へ進む。
  //    次の時点がまだ来ていない古い投稿が先頭を埋めても、新しい投稿の時点を取りこぼさないため
  const readPage = (after: { publishedAt: Date; id: string } | null) =>
    db
      .select({
        draftId: threadsPostDraft.id,
        threadsAccountId: threadsPostDraft.threadsAccountId,
        publishedAt: threadsPostDraft.publishedAt,
        mediaId: threadsPostDraft.threadsMediaId,
        taken: sql<
          string[]
        >`coalesce((SELECT array_agg(${threadsPostMetricSnapshot.kind}) FROM ${threadsPostMetricSnapshot} WHERE ${threadsPostMetricSnapshot.draftId} = ${threadsPostDraft.id}), '{}')`,
      })
      .from(threadsPostDraft)
      .innerJoin(threadsAccount, eq(threadsAccount.id, threadsPostDraft.threadsAccountId))
      .leftJoin(threadsPostMetric, eq(threadsPostMetric.draftId, threadsPostDraft.id))
      .where(
        and(
          eq(threadsPostDraft.status, "published"),
          eq(threadsAccount.connectionStatus, "connected"),
          or(
            isNull(threadsAccount.insightsDeniedAt),
            lt(threadsAccount.insightsDeniedAt, todayStart),
          ),
          or(isNull(threadsPostMetric.state), eq(threadsPostMetric.state, "updating")),
          lt(threadsPostDraft.publishedAt, new Date(now.getTime() - 23 * HOUR_MS)),
          after
            ? sql`(${threadsPostDraft.publishedAt}, ${threadsPostDraft.id}) > (${after.publishedAt}, ${after.id})`
            : undefined,
        ),
      )
      .orderBy(asc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
      .limit(calls + 40);

  // 2. 何を取るかを決める（幅の中の時点を先に、次に補い）
  const slot: Work[] = [];
  const daily: Work[] = [];
  let cursor: { publishedAt: Date; id: string } | null = null;
  for (let page = 0; page < METRICS_MAX_PAGES && slot.length + daily.length < calls; page += 1) {
    const rows = await readPage(cursor);
    for (const row of rows) {
      if (!row.publishedAt) continue;
      const elapsed = elapsedMinutes(row.publishedAt, now);
      const taken = new Set(
        row.taken.filter(
          (kind): kind is MetricsMilestone => kind === "h24" || kind === "d3" || kind === "d7",
        ),
      );
      const base = {
        draftId: row.draftId,
        threadsAccountId: row.threadsAccountId,
        mediaId: row.mediaId,
        elapsed,
      };
      const milestone = milestoneForElapsed(elapsed);
      if (milestone && !taken.has(milestone)) {
        if (row.mediaId) slot.push({ ...base, kind: milestone, method: "slot" });
        continue;
      }
      if (!row.mediaId) {
        daily.push({ ...base, kind: "no_media", method: "daily" });
        continue;
      }
      const kind = catchUpKind(elapsed, taken);
      if (kind) daily.push({ ...base, kind, method: "daily" });
    }
    const last = rows.at(-1);
    if (!last?.publishedAt || rows.length < calls + 40) break;
    cursor = { publishedAt: last.publishedAt, id: last.draftId };
  }

  // 3. Threads に問い合わせる
  const tokens = new Map<
    string,
    { token: string | null; generation: number; threadsUserId: string | null }
  >();
  /**
   * 運用アカウントのトークンを開ける（1回だけ）。
   * @param threadsAccountId 運用アカウントの ID
   * @returns トークンと世代
   */
  const tokenFor = async (threadsAccountId: string) => {
    const cached = tokens.get(threadsAccountId);
    if (cached) return cached;
    const cred = await loadCredentials(db, deps.secretBox, threadsAccountId, logger);
    const value = {
      token: cred?.connectionStatus === "connected" ? cred.token : null,
      generation: cred?.generation ?? 0,
      threadsUserId: cred?.threadsUserId ?? null,
    };
    tokens.set(threadsAccountId, value);
    return value;
  };
  const skip = new Set<string>();
  const denied = new Set<string>();
  const reconnect = new Map<string, number>();
  const fetched: { work: Work; metrics: ThreadsMediaInsights }[] = [];
  const unmeasurable: { work: Work; reason: "not_found" | "no_media_id" }[] = [];
  let stopped = false;
  for (const work of [...slot, ...daily]) {
    if (work.kind === "no_media") {
      unmeasurable.push({ work, reason: "no_media_id" });
      continue;
    }
    if (stopped || calls <= 0 || skip.has(work.threadsAccountId) || !work.mediaId) continue;
    const { token, generation } = await tokenFor(work.threadsAccountId);
    if (!token) {
      skip.add(work.threadsAccountId);
      continue;
    }
    calls -= 1;
    try {
      fetched.push({ work, metrics: await threads.getMediaInsights(token, work.mediaId) });
    } catch (error) {
      if (error instanceof ThreadsNotFoundError) unmeasurable.push({ work, reason: "not_found" });
      else if (error instanceof ThreadsPermissionError) {
        denied.add(work.threadsAccountId);
        skip.add(work.threadsAccountId);
      } else if (error instanceof ThreadsAuthError) {
        reconnect.set(work.threadsAccountId, generation);
        skip.add(work.threadsAccountId);
      } else if (error instanceof ThreadsRateLimitError) stopped = true;
      else {
        // 一時的な失敗など：記録しない（幅の中なら次の回、過ぎたら補い）
        logger.warn(
          { draftId: work.draftId, errorName: (error as Error).name },
          "反応を取りこめませんでした",
        );
      }
    }
  }

  // 4. フォロワーの数（今日の記録がなく、直近30日に投稿済みがある運用アカウント）
  const followers: { threadsAccountId: string; count: number }[] = [];
  if (!stopped && calls > 0) {
    const targets = await db
      .select({ id: threadsAccount.id })
      .from(threadsAccount)
      .where(
        and(
          eq(threadsAccount.connectionStatus, "connected"),
          or(
            isNull(threadsAccount.insightsDeniedAt),
            lt(threadsAccount.insightsDeniedAt, todayStart),
          ),
          exists(
            db
              .select({ id: threadsPostDraft.id })
              .from(threadsPostDraft)
              .where(
                and(
                  eq(threadsPostDraft.threadsAccountId, threadsAccount.id),
                  eq(threadsPostDraft.status, "published"),
                  gte(
                    threadsPostDraft.publishedAt,
                    new Date(now.getTime() - FOLLOWER_ACTIVE_DAYS * 24 * HOUR_MS),
                  ),
                ),
              ),
          ),
          not(
            exists(
              db
                .select({ id: threadsFollowerSnapshot.threadsAccountId })
                .from(threadsFollowerSnapshot)
                .where(
                  and(
                    eq(threadsFollowerSnapshot.threadsAccountId, threadsAccount.id),
                    eq(threadsFollowerSnapshot.snapshotDate, today),
                  ),
                ),
            ),
          ),
        ),
      )
      .orderBy(asc(threadsAccount.id));
    for (const target of targets) {
      if (calls <= 0 || skip.has(target.id) || denied.has(target.id)) continue;
      const { token, generation, threadsUserId } = await tokenFor(target.id);
      if (!token || !threadsUserId) continue;
      calls -= 1;
      try {
        followers.push({
          threadsAccountId: target.id,
          count: await threads.getFollowersCount(token, threadsUserId),
        });
      } catch (error) {
        if (error instanceof ThreadsPermissionError) denied.add(target.id);
        else if (error instanceof ThreadsAuthError) reconnect.set(target.id, generation);
        else if (error instanceof ThreadsRateLimitError) break;
      }
    }
  }

  // 5. 書きこむ（1つのトランザクション）
  await db.transaction(async (tx) => {
    if (fetched.length > 0) {
      await tx
        .insert(threadsPostMetricSnapshot)
        .values(
          fetched.map(({ work, metrics }) => ({
            draftId: work.draftId,
            threadsAccountId: work.threadsAccountId,
            kind: work.kind as MetricsKindValue,
            method: work.method,
            fetchedAt: now,
            elapsedMinutes: work.elapsed,
            ...metrics,
          })),
        )
        .onConflictDoNothing({
          target: [threadsPostMetricSnapshot.draftId, threadsPostMetricSnapshot.kind],
        });
    }
    for (const { work, metrics } of fetched) {
      const kind = work.kind as MetricsKindValue;
      const late =
        kind === "late" || (kind === "d7" && work.elapsed > METRICS_LATE_AFTER_HOURS * 60);
      const state =
        kind === "h24" || kind === "d3" ? "updating" : late ? "late_confirmed" : "confirmed";
      const values = {
        ...metrics,
        state,
        lastFetchedAt: now,
        lastElapsedMinutes: work.elapsed,
        lastKind: kind,
        confirmedAt: state === "updating" ? null : now,
      } as const;
      await tx
        .insert(threadsPostMetric)
        .values({ draftId: work.draftId, threadsAccountId: work.threadsAccountId, ...values })
        .onConflictDoUpdate({
          target: threadsPostMetric.draftId,
          set: values,
          // 確定・計れないの行は変えない（重なった処理が確定の値を上書きしない）
          setWhere: eq(threadsPostMetric.state, "updating"),
        });
    }
    for (const { work, reason } of unmeasurable) {
      await tx
        .insert(threadsPostMetric)
        .values({
          draftId: work.draftId,
          threadsAccountId: work.threadsAccountId,
          state: "unmeasurable",
          unmeasurableReason: reason,
        })
        .onConflictDoUpdate({
          target: threadsPostMetric.draftId,
          set: { state: "unmeasurable", unmeasurableReason: reason },
          setWhere: eq(threadsPostMetric.state, "updating"),
        });
    }
    if (followers.length > 0) {
      await tx
        .insert(threadsFollowerSnapshot)
        .values(
          followers.map((item) => ({
            threadsAccountId: item.threadsAccountId,
            snapshotDate: today,
            followersCount: item.count,
            capturedAt: now,
          })),
        )
        .onConflictDoNothing();
    }
    if (denied.size > 0) {
      await tx
        .update(threadsAccount)
        .set({ insightsDeniedAt: now })
        .where(inArray(threadsAccount.id, [...denied]));
    }
  });
  for (const [threadsAccountId, generation] of reconnect)
    await markNeedsReconnect(db, threadsAccountId, generation);

  // 6. 確定した投稿があった運用アカウントを判定する
  const confirmedAccounts = [
    ...new Set(
      fetched
        .filter(({ work }) => work.kind === "d7" || work.kind === "late")
        .map(({ work }) => work.threadsAccountId),
    ),
  ];
  for (const threadsAccountId of confirmedAccounts) await judgeAccount(deps, threadsAccountId, now);
  return fetched.length + followers.length;
}

/**
 * 運用アカウントの、判定がまだの確定した投稿をまとめて判定する。基準値は「確定」（遅れて確定を除く）で閲覧のある、
 * 投稿の新しい30件の閲覧の中央値。5件に足りない・基準値が0なら判定しない。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 */
export async function judgeAccount(
  deps: Pick<DomainRouteDeps, "db">,
  threadsAccountId: string,
  now: Date,
): Promise<void> {
  const { db } = deps;
  const sample = await db
    .select({ views: threadsPostMetric.views })
    .from(threadsPostMetric)
    .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetric.draftId))
    .where(
      and(
        eq(threadsPostMetric.threadsAccountId, threadsAccountId),
        eq(threadsPostMetric.state, "confirmed"),
        isNotNull(threadsPostMetric.views),
      ),
    )
    .orderBy(desc(threadsPostDraft.publishedAt), asc(threadsPostDraft.id))
    .limit(PERFORMANCE_BASELINE_SAMPLE);
  const values = sample.flatMap((row) => (row.views === null ? [] : [row.views]));
  const baseline = median(values);
  if (values.length < PERFORMANCE_MIN_JUDGEABLE || baseline === null || baseline <= 0) return;
  const targets = await db
    .select({ draftId: threadsPostMetric.draftId, views: threadsPostMetric.views })
    .from(threadsPostMetric)
    .where(
      and(
        eq(threadsPostMetric.threadsAccountId, threadsAccountId),
        inArray(threadsPostMetric.state, ["confirmed", "late_confirmed"]),
        isNull(threadsPostMetric.judgment),
        isNotNull(threadsPostMetric.views),
      ),
    );
  for (const target of targets) {
    if (target.views === null) continue;
    await db
      .update(threadsPostMetric)
      .set({
        judgment: judge(target.views, baseline),
        judgmentRatio: target.views / baseline,
        judgmentBaseline: baseline,
        judgedAt: now,
      })
      .where(
        and(eq(threadsPostMetric.draftId, target.draftId), isNull(threadsPostMetric.judgment)),
      );
  }
}
