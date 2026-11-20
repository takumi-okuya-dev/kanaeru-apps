// 運用状況（threads-013。PRD 組織 5.5。めぐるの specs/020-team-monitoring と teams/team-status.ts を写した）。
// 新しい記録は取らず、開いたときに今ある表（操作の記録・投稿の案・反応）から数える。読むだけで、書きこみも記録もしない。
// 返すのは数と日付だけ（本文・戦略・設定・記録の中身・トークンは返さない。FR-T46）。
// 見る範囲は statusScopeOf（team.ts）が決め、ここでは範囲の外の行を問い合わせの条件で除く（画面で隠さない）。
import {
  TEAM_STATUS_ACTIVITY_ACTIONS,
  TEAM_STATUS_GROWTH_WINDOW_DAYS,
  TEAM_STATUS_STOPPED_DAYS,
  teamGrowthOf,
} from "@workspace/contracts/threads";
import type { ThreadsTeamStatus } from "@workspace/contracts/threads";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { listMembers } from "../suite/index.ts";
import {
  threadsAccount,
  threadsActivityLog,
  threadsOrganizationAccount,
  threadsPostDraft,
  threadsPostMetric,
} from "./schema.ts";

/** 1日のミリ秒。 */
const DAY_MS = 86_400_000;

/** 運用状況を見る範囲。 */
export type TeamStatusScope = { kind: "all" } | { kind: "assigned"; accountIds: string[] };

/**
 * 値の並びを、問い合わせの IN の中身にする（値は引数で渡す）。
 * @param values 値
 * @returns SQL
 */
function sqlList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * 組織の運用状況を数える（管理者はすべて、編集者は担当の運用アカウントとその持ち主の行だけ）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param viewerAccountId 見ている人
 * @param scope 見る範囲
 * @param now 今
 * @returns 運用状況
 */
export async function getTeamStatus(
  db: Executor,
  organizationId: string,
  viewerAccountId: string,
  scope: TeamStatusScope,
  now: Date = new Date(),
): Promise<ThreadsTeamStatus> {
  const stoppedBefore = new Date(now.getTime() - TEAM_STATUS_STOPPED_DAYS * DAY_MS);
  const recentFrom = new Date(now.getTime() - TEAM_STATUS_GROWTH_WINDOW_DAYS * DAY_MS);
  const previousFrom = new Date(now.getTime() - 2 * TEAM_STATUS_GROWTH_WINDOW_DAYS * DAY_MS);

  // ---- 運用アカウント（範囲の中だけ）----
  const placed = await db
    .select({ account: threadsAccount, placedAt: threadsOrganizationAccount.placedAt })
    .from(threadsOrganizationAccount)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsOrganizationAccount.threadsAccountId))
    .where(
      and(
        eq(threadsOrganizationAccount.organizationId, organizationId),
        scope.kind === "assigned"
          ? inArray(threadsOrganizationAccount.threadsAccountId, scope.accountIds)
          : undefined,
      ),
    )
    .orderBy(asc(threadsOrganizationAccount.placedAt), asc(threadsAccount.id));
  const members = await listMembers(db, organizationId);
  const memberById = new Map(members.map((row) => [row.accountId, row]));

  const accounts: (ThreadsTeamStatus["accounts"][number] & { origin: number })[] = [];
  for (const { account, placedAt } of placed) {
    // 組織に入れた日より前は数えない（FR-T43）
    const since = placedAt > stoppedBefore ? placedAt : stoppedBefore;
    const [counts] = await db
      .select({
        lastPostedAt: sql<
          Date | string | null
        >`max(${threadsPostDraft.publishedAt}) FILTER (WHERE ${threadsPostDraft.status} = 'published' AND ${threadsPostDraft.publishedAt} >= ${placedAt.toISOString()})`,
        postCount7d: sql<number>`(count(*) FILTER (WHERE ${threadsPostDraft.status} = 'published' AND ${threadsPostDraft.publishedAt} > ${since.toISOString()}))::int`,
        approvedCount: sql<number>`(count(*) FILTER (WHERE ${threadsPostDraft.status} IN ('approved', 'publishing')))::int`,
        needsReviewCount: sql<number>`(count(*) FILTER (WHERE ${threadsPostDraft.status} = 'needs_review'))::int`,
      })
      .from(threadsPostDraft)
      .where(eq(threadsPostDraft.threadsAccountId, account.id));
    const window = async (from: Date, to: Date) => {
      const [row] = await db
        .select({
          median: sql<
            number | string | null
          >`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${threadsPostMetric.views})`,
          count: sql<number>`count(*)::int`,
        })
        .from(threadsPostMetric)
        .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMetric.draftId))
        .where(
          and(
            eq(threadsPostMetric.threadsAccountId, account.id),
            sql`${threadsPostMetric.state} IN ('confirmed', 'late_confirmed')`,
            sql`${threadsPostMetric.views} IS NOT NULL`,
            sql`${threadsPostDraft.publishedAt} >= ${from.toISOString()}`,
            sql`${threadsPostDraft.publishedAt} < ${to.toISOString()}`,
          ),
        );
      return {
        median: row?.median === null || row?.median === undefined ? null : Number(row.median),
        count: Number(row?.count ?? 0),
      };
    };
    const lastPostedAt = counts?.lastPostedAt ? new Date(counts.lastPostedAt) : null;
    const origin = Math.max(lastPostedAt?.getTime() ?? 0, placedAt.getTime());
    accounts.push({
      threadsAccountId: account.id,
      name: account.name,
      ownerName: memberById.get(account.accountId)?.displayName ?? "",
      ownerIsMe: account.accountId === viewerAccountId,
      connectionStatus: account.connectionStatus,
      lastPostedAt: lastPostedAt?.toISOString() ?? null,
      postCount7d: counts?.postCount7d ?? 0,
      approvedCount: counts?.approvedCount ?? 0,
      needsReviewCount: counts?.needsReviewCount ?? 0,
      stopped: origin < stoppedBefore.getTime(),
      growth: teamGrowthOf(await window(recentFrom, now), await window(previousFrom, recentFrom)),
      origin,
    });
  }

  // ---- 人（範囲が担当なら、担当の運用アカウントの持ち主だけ。動きは範囲の運用アカウントでの動きだけ数える）----
  const scopeIds = placed.map((row) => row.account.id);
  const owners = new Set(placed.map((row) => row.account.accountId));
  const peopleRows =
    scope.kind === "assigned" ? members.filter((row) => owners.has(row.accountId)) : members;
  const people: (ThreadsTeamStatus["people"][number] & { origin: number })[] = [];
  for (const member of peopleRows) {
    const [activity] =
      scopeIds.length === 0
        ? [{ lastActiveAt: null, activeCount7d: 0 }]
        : await db
            .select({
              lastActiveAt: sql<Date | string | null>`max(${threadsActivityLog.createdAt})`,
              activeCount7d: sql<number>`(count(*) FILTER (WHERE ${threadsActivityLog.createdAt} > ${stoppedBefore.toISOString()}))::int`,
            })
            .from(threadsActivityLog)
            .where(
              and(
                eq(threadsActivityLog.actorAccountId, member.accountId),
                // 運用アカウントごとに、今の組織に入れたあとの動きだけを数える（入れる前・前に入れていたときの動きは数えない）
                sql`(${sql.join(
                  placed.map(
                    (row) =>
                      sql`(${threadsActivityLog.threadsAccountId} = ${row.account.id} AND ${threadsActivityLog.createdAt} >= ${row.placedAt.toISOString()})`,
                  ),
                  sql` OR `,
                )})`,
                sql`${threadsActivityLog.action} IN (${sqlList(TEAM_STATUS_ACTIVITY_ACTIONS)})`,
              ),
            );
    const lastActiveAt = activity?.lastActiveAt ? new Date(activity.lastActiveAt) : null;
    // 一度も動いていない人は、入った日から数える（入ったばかりの人に印を付けない）
    const origin = Math.max(lastActiveAt?.getTime() ?? 0, member.joinedAt.getTime());
    people.push({
      accountId: member.accountId,
      displayName: member.displayName,
      role: member.role,
      isMe: member.accountId === viewerAccountId,
      lastActiveAt: lastActiveAt?.toISOString() ?? null,
      activeCount7d: activity?.activeCount7d ?? 0,
      stopped: origin < stoppedBefore.getTime(),
      origin,
    });
  }

  // ---- 並び（印の付いたものを上に、同じ印の中は止まっている日数の長い順。FR-T45）----
  people.sort((a, b) => {
    if (a.stopped !== b.stopped) return a.stopped ? -1 : 1;
    if (a.stopped) return a.origin - b.origin;
    return a.displayName.localeCompare(b.displayName, "ja");
  });
  const rank = (row: (typeof accounts)[number]) =>
    row.stopped ? 0 : row.growth.state === "poor" ? 1 : 2;
  accounts.sort((a, b) => rank(a) - rank(b) || (a.stopped && b.stopped ? a.origin - b.origin : 0));
  const strip = <T extends { origin: number }>({ origin: _origin, ...rest }: T) => rest;
  return {
    scope: scope.kind,
    generatedAt: now.toISOString(),
    stoppedCount:
      people.filter((row) => row.stopped).length + accounts.filter((row) => row.stopped).length,
    people: people.map(strip),
    accounts: accounts.map(strip),
  };
}
