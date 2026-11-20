// チーム運用の読み書き（threads-013。PRD 組織 5.1〜5.4・5.6）。組織そのもの（人・役割）は suite の index.ts から読み、suite の表に書かない。
// - 判定は access.ts の1か所。ここは判定を通ったあとの読み書きと、組織の画面・担当・知らせの中身
// - 「組織に入れる」・担当は threads の表。人が抜ける・組織が消えると、外部キーの CASCADE で消える（ここでは消さない）
// - 担当と「承認を任せる」は、今の役割が編集者か管理者で、最後にメンバーに下げた日時より後に付けたものだけ効く（assignmentEffective）
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import type {
  ActivityAction,
  PostDraft,
  ThreadsAccountTeam,
  ThreadsOrganizationView,
  ThreadsTeamNotices,
} from "@workspace/contracts/threads";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { findDisplayNames } from "../account/index.ts";
import { findMembership, findOrganization, listMembers, listMemberships } from "../suite/index.ts";
import type { OrganizationMembership } from "../suite/index.ts";
import { allows, assignmentEffective } from "./access.ts";
import type { AccountAccess } from "./access.ts";
import { recordActivity } from "./activity-log.ts";
import { DELETABLE_STATUSES, countDrafts } from "./repository.ts";
import type { DraftCountsRecord, PostDraftRecord, ThreadsAccountRecord } from "./repository.ts";
import {
  threadsAccount,
  threadsAssignment,
  threadsOrganizationAccount,
  threadsPostDraft,
} from "./schema.ts";

/**
 * 呼んだ人が消してよい案の状態（承認を任されていない担当の人は承認待ちだけ。却下の案を消すのは承認と同じ扱い。PRD 組織 5.2）。
 * 消すトランザクションの中で、この状態だけを消す（確かめてから消すまでに状態が変わっても、権限の外は消さない）。
 * @param access 運用アカウントの関わり
 * @returns 消してよい状態
 */
export function deletableStatuses(access: AccountAccess): readonly PostDraftRecord["status"][] {
  return allows(access, "review") ? DELETABLE_STATUSES : ["needs_review"];
}

/**
 * 消してよい案の ID（承認を任されていない担当の人は、承認待ちの案だけ。PRD 組織 5.2）。
 * @param db DB
 * @param access 判定の結果（write_content を通ったもの）
 * @param ids 消したい案の ID
 * @returns 消してよい ID
 */
export async function deletableDraftIds(
  db: Executor,
  access: AccountAccess,
  ids: readonly string[],
): Promise<string[]> {
  if (allows(access, "review") || ids.length === 0) return [...ids];
  const rows = await db
    .select({ id: threadsPostDraft.id })
    .from(threadsPostDraft)
    .where(
      and(
        eq(threadsPostDraft.threadsAccountId, access.account.id),
        inArray(threadsPostDraft.id, [...ids]),
        eq(threadsPostDraft.status, "needs_review"),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * 案の作った人・最後に直した人の表示名（組織に入っている運用アカウントだけで使う）。
 * @param db DB
 * @param drafts 案
 * @returns account の ID → 表示名
 */
export async function draftActorNames(
  db: Executor,
  drafts: readonly PostDraftRecord[],
): Promise<Map<string, string>> {
  return findDisplayNames(
    db,
    drafts.flatMap((draft) =>
      [draft.createdByAccountId, draft.updatedByAccountId].filter(
        (id): id is string => id !== null,
      ),
    ),
  );
}

/**
 * 案の返す形に、作った人・最後に直した人の表示名を足す（名前を読まないときは足さない）。
 * 前の行（列が空）は名前を出さず、した人が退会していれば「退会した人」と出す。
 * @param view 案の返す形
 * @param row 案の行
 * @param names 表示名（null なら足さない）
 * @returns 案の返す形
 */
export function withDraftActors(
  view: PostDraft,
  row: PostDraftRecord,
  names: Map<string, string> | null,
): PostDraft {
  if (!names) return view;
  const nameOf = (id: string | null): string | null => (id ? (names.get(id) ?? null) : null);
  return {
    ...view,
    createdByName: nameOf(row.createdByAccountId),
    updatedByName: nameOf(row.updatedByAccountId),
  };
}

/** 担当している運用アカウント（一覧に出す形のもと）。 */
export type AssignedAccountRow = {
  account: ThreadsAccountRecord;
  counts: DraftCountsRecord;
  ownerName: string;
  organizationName: string;
};

/**
 * 今の利用者が担当している運用アカウント（ほかの人のもの。効いている担当だけ）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @returns 担当している運用アカウント（組織に入れた順）
 */
export async function listAssignedAccounts(
  db: Db,
  viewerAccountId: string,
): Promise<AssignedAccountRow[]> {
  const rows = await db
    .select({
      account: threadsAccount,
      organizationId: threadsAssignment.organizationId,
      assignedAt: threadsAssignment.assignedAt,
    })
    .from(threadsAssignment)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsAssignment.threadsAccountId))
    .where(eq(threadsAssignment.accountId, viewerAccountId))
    .orderBy(asc(threadsAssignment.assignedAt), asc(threadsAccount.id));
  const memberships = new Map(
    (await listMemberships(db, viewerAccountId)).map((row) => [row.organizationId, row]),
  );
  const effective = rows.filter(
    (row) =>
      row.account.accountId !== viewerAccountId &&
      assignmentEffective(memberships.get(row.organizationId) ?? null, row.assignedAt),
  );
  const names = await findDisplayNames(
    db,
    effective.map((row) => row.account.accountId),
  );
  const result: AssignedAccountRow[] = [];
  for (const row of effective) {
    result.push({
      account: row.account,
      counts: await countDrafts(db, row.account.id),
      ownerName: names.get(row.account.accountId) ?? "",
      organizationName: memberships.get(row.organizationId)?.organizationName ?? "",
    });
  }
  return result;
}

/**
 * 組織の操作を、その運用アカウントの操作の記録に残す（90日。FR-T51）。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID
 * @param action 操作
 * @param actorAccountId した人
 * @param summary 対象の要約（組織の名前・人の表示名など）
 */
async function recordTeamActivity(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  threadsAccountId: string,
  action: ActivityAction,
  actorAccountId: string | null,
  summary: string | null = null,
): Promise<void> {
  await recordActivity(deps, threadsAccountId, {
    kind: "settings",
    action,
    summary,
    actorAccountId,
  });
}

/**
 * 「このアカウントのチーム」と、組織に入れる区分の中身（持ち主と担当の人だけが読む。FR-T30〜FR-T32）。
 * @param db DB
 * @param access 判定の結果（team_card を通ったもの）
 * @returns チーム
 */
export async function getAccountTeam(db: Db, access: AccountAccess): Promise<ThreadsAccountTeam> {
  const me = access.viewerAccountId;
  const owner = access.account.accountId;
  const candidates =
    access.relation === "owner"
      ? (await listMemberships(db, me)).map((row) => ({
          id: row.organizationId,
          name: row.organizationName,
        }))
      : [];
  const [placement] = await db
    .select()
    .from(threadsOrganizationAccount)
    .where(eq(threadsOrganizationAccount.threadsAccountId, access.account.id))
    .limit(1);
  if (!placement) return { organization: null, shared: false, people: [], candidates };
  const found = await findOrganization(db, placement.organizationId);
  const members = new Map(
    (await listMembers(db, placement.organizationId)).map((row) => [row.accountId, row]),
  );
  const assignments = await db
    .select()
    .from(threadsAssignment)
    .where(eq(threadsAssignment.threadsAccountId, access.account.id))
    .orderBy(asc(threadsAssignment.assignedAt));
  const people: ThreadsAccountTeam["people"] = [];
  const admin = [...members.values()].find((row) => row.role === "admin");
  if (admin && admin.accountId !== owner) {
    people.push({
      accountId: admin.accountId,
      displayName: admin.displayName,
      position: "admin",
      role: "admin",
      delegated: false,
      isMe: admin.accountId === me,
    });
  }
  const ownerMember = members.get(owner);
  if (ownerMember) {
    people.push({
      accountId: owner,
      displayName: ownerMember.displayName,
      position: "owner",
      role: ownerMember.role,
      delegated: false,
      isMe: owner === me,
    });
  }
  for (const row of assignments) {
    const member = members.get(row.accountId);
    if (!member || !assignmentEffective(member, row.assignedAt)) continue;
    people.push({
      accountId: row.accountId,
      displayName: member.displayName,
      position: "assignee",
      role: member.role,
      delegated:
        row.delegated &&
        row.delegatedAt !== null &&
        (member.demotedAt === null || row.delegatedAt > member.demotedAt),
      isMe: row.accountId === me,
    });
  }
  return {
    organization: found ? { id: found.id, name: found.name } : null,
    shared: placement.shared,
    people,
    candidates,
  };
}

/**
 * 運用アカウントを組織に入れる・外す・入れ直す（持ち主だけ。1つの運用アカウントは1つの組織にだけ入る）。
 * 外すと、その運用アカウントの担当・任せるは外部キーで消え、見せる設定もなくなる。
 * @param deps 土台が渡す道具
 * @param access 判定の結果（manage を通ったもの）
 * @param organizationId 入れる組織（null で外す）
 * @throws {AppError} 持ち主がその組織の人でない（THREADS_TEAM_NOT_FOUND）
 */
export async function placeAccount(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  access: AccountAccess,
  organizationId: string | null,
): Promise<void> {
  const { db } = deps;
  const owner = access.account.accountId;
  const threadsAccountId = access.account.id;
  if (organizationId && !(await findMembership(db, organizationId, owner))) {
    throw new AppError(THREADS_ERRORS.THREADS_TEAM_NOT_FOUND);
  }
  const changed = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(threadsOrganizationAccount)
      .where(eq(threadsOrganizationAccount.threadsAccountId, threadsAccountId))
      .for("update");
    if ((current?.organizationId ?? null) === organizationId) return null;
    if (current) {
      await tx
        .delete(threadsOrganizationAccount)
        .where(eq(threadsOrganizationAccount.threadsAccountId, threadsAccountId));
    }
    if (organizationId) {
      await tx
        .insert(threadsOrganizationAccount)
        .values({ threadsAccountId, organizationId, ownerAccountId: owner });
    }
    return { removedFrom: current?.organizationId ?? null };
  });
  if (!changed) return;
  if (changed.removedFrom) {
    const removed = await findOrganization(db, changed.removedFrom);
    await recordTeamActivity(deps, threadsAccountId, "organization_removed", owner, removed?.name);
  }
  if (organizationId) {
    const placed = await findOrganization(db, organizationId);
    await recordTeamActivity(deps, threadsAccountId, "organization_placed", owner, placed?.name);
  }
}

/**
 * 組織に見せるを切り替える（持ち主だけ。組織に入っていなければ断る）。
 * @param deps 土台が渡す道具
 * @param access 判定の結果（manage を通ったもの）
 * @param shared 見せるか
 * @throws {AppError} 組織に入っていない（THREADS_TEAM_NOT_FOUND）
 */
export async function setShared(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  access: AccountAccess,
  shared: boolean,
): Promise<void> {
  const updated = await deps.db
    .update(threadsOrganizationAccount)
    .set({ shared })
    .where(eq(threadsOrganizationAccount.threadsAccountId, access.account.id))
    .returning({ shared: threadsOrganizationAccount.shared });
  if (updated.length === 0) throw new AppError(THREADS_ERRORS.THREADS_TEAM_NOT_FOUND);
  await recordTeamActivity(
    deps,
    access.account.id,
    "organization_shared",
    access.viewerAccountId,
    shared ? "見せる" : "見せない",
  );
}

/**
 * 担当の人に「承認を任せる」を切り替える（持ち主だけ。効いている担当の人だけ）。
 * @param deps 土台が渡す道具
 * @param access 判定の結果（manage を通ったもの）
 * @param personAccountId 担当の人
 * @param delegated 任せるか
 * @throws {AppError} 担当の人でない（THREADS_DELEGATION_NOT_ALLOWED）
 */
export async function setDelegation(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  access: AccountAccess,
  personAccountId: string,
  delegated: boolean,
): Promise<void> {
  const { db } = deps;
  const [row] = await db
    .select()
    .from(threadsAssignment)
    .where(
      and(
        eq(threadsAssignment.threadsAccountId, access.account.id),
        eq(threadsAssignment.accountId, personAccountId),
      ),
    )
    .limit(1);
  const membership = row ? await findMembership(db, row.organizationId, personAccountId) : null;
  if (!row || !assignmentEffective(membership, row.assignedAt)) {
    throw new AppError(THREADS_ERRORS.THREADS_DELEGATION_NOT_ALLOWED);
  }
  await db
    .update(threadsAssignment)
    .set(delegated ? { delegated, delegatedAt: sql`now()` } : { delegated, delegatedAt: null })
    .where(
      and(
        eq(threadsAssignment.threadsAccountId, access.account.id),
        eq(threadsAssignment.accountId, personAccountId),
      ),
    );
  const names = await findDisplayNames(db, [personAccountId]);
  await recordTeamActivity(
    deps,
    access.account.id,
    "delegation_changed",
    access.viewerAccountId,
    `${names.get(personAccountId) ?? ""}：${delegated ? "任せる" : "任せない"}`,
  );
}

/**
 * Threads の組織の画面の判定（組織の人でなければ 404）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param viewerAccountId 今の利用者
 * @returns 今の利用者の組織の人の行
 * @throws {AppError} 組織の人でない（THREADS_TEAM_NOT_FOUND）
 */
export async function requireTeamMember(
  db: Executor,
  organizationId: string,
  viewerAccountId: string,
): Promise<OrganizationMembership> {
  const membership = await findMembership(db, organizationId, viewerAccountId);
  if (!membership) throw new AppError(THREADS_ERRORS.THREADS_TEAM_NOT_FOUND);
  return membership;
}

/**
 * 組織の中で効いている担当（運用アカウントごとの担当の人。メンバーに下げる前のものは除く）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param memberships 組織の人（account の ID → 行）
 * @returns 担当の行
 */
async function effectiveAssignments(
  db: Executor,
  organizationId: string,
  memberships: ReadonlyMap<string, OrganizationMembership>,
) {
  const rows = await db
    .select()
    .from(threadsAssignment)
    .where(eq(threadsAssignment.organizationId, organizationId))
    .orderBy(asc(threadsAssignment.assignedAt));
  return rows.filter((row) =>
    assignmentEffective(memberships.get(row.accountId) ?? null, row.assignedAt),
  );
}

/**
 * 運用状況を見られる範囲（管理者はすべて、担当が1つ以上ある編集者は担当の運用アカウントだけ。ほかは null。FR-T40）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param membership 今の利用者の組織の人の行
 * @returns 範囲（見られなければ null）
 */
export async function statusScopeOf(
  db: Executor,
  organizationId: string,
  membership: OrganizationMembership,
): Promise<{ kind: "all" } | { kind: "assigned"; accountIds: string[] } | null> {
  if (membership.role === "admin") return { kind: "all" };
  if (membership.role !== "editor") return null;
  const rows = await db
    .select({
      threadsAccountId: threadsAssignment.threadsAccountId,
      assignedAt: threadsAssignment.assignedAt,
    })
    .from(threadsAssignment)
    .where(
      and(
        eq(threadsAssignment.organizationId, organizationId),
        eq(threadsAssignment.accountId, membership.accountId),
      ),
    );
  const accountIds = rows
    .filter((row) => assignmentEffective(membership, row.assignedAt))
    .map((row) => row.threadsAccountId);
  return accountIds.length > 0 ? { kind: "assigned", accountIds } : null;
}

/**
 * 入っている組織と、組織に入っている運用アカウントの数（ナビの「組織」を出すかに使う）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @returns 組織の一覧
 */
export async function listTeamOrganizations(db: Executor, viewerAccountId: string) {
  const memberships = await listMemberships(db, viewerAccountId);
  const organizations = [];
  for (const row of memberships) {
    const placed = await db
      .select({ id: threadsOrganizationAccount.threadsAccountId })
      .from(threadsOrganizationAccount)
      .where(eq(threadsOrganizationAccount.organizationId, row.organizationId));
    organizations.push({
      id: row.organizationId,
      name: row.organizationName,
      myRole: row.role,
      accountCount: placed.length,
    });
  }
  return organizations;
}

/**
 * Threads の組織の画面の中身（名前・持ち主・見せる状態はどの組織の人にも見える。担当の表は管理者だけ）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param membership 今の利用者の組織の人の行
 * @returns 組織の画面
 */
export async function getOrganizationView(
  db: Executor,
  organizationId: string,
  membership: OrganizationMembership,
): Promise<ThreadsOrganizationView> {
  const me = membership.accountId;
  const found = await findOrganization(db, organizationId);
  if (!found) throw new AppError(THREADS_ERRORS.THREADS_TEAM_NOT_FOUND);
  const members = await listMembers(db, organizationId);
  const byId = new Map(members.map((row) => [row.accountId, row]));
  const placed = await db
    .select({
      account: threadsAccount,
      shared: threadsOrganizationAccount.shared,
      placedAt: threadsOrganizationAccount.placedAt,
    })
    .from(threadsOrganizationAccount)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsOrganizationAccount.threadsAccountId))
    .where(eq(threadsOrganizationAccount.organizationId, organizationId))
    .orderBy(asc(threadsOrganizationAccount.placedAt), asc(threadsAccount.id));
  const assignments = await effectiveAssignments(db, organizationId, byId);
  const mine = new Set(
    assignments.filter((row) => row.accountId === me).map((row) => row.threadsAccountId),
  );
  const isAdmin = membership.role === "admin";
  const scope = await statusScopeOf(db, organizationId, membership);
  return {
    id: found.id,
    name: found.name,
    myRole: membership.role,
    accounts: placed.map((row) => ({
      id: row.account.id,
      name: row.account.name,
      ownerAccountId: row.account.accountId,
      ownerName: byId.get(row.account.accountId)?.displayName ?? "",
      ownerIsMe: row.account.accountId === me,
      shared: row.shared,
      connectionStatus: row.account.connectionStatus,
      access:
        row.account.accountId === me
          ? "manage"
          : mine.has(row.account.id)
            ? "assigned"
            : row.shared
              ? "shared"
              : "none",
      placedAt: row.placedAt.toISOString(),
    })),
    assignments: isAdmin
      ? members
          .filter((row) => row.role !== "member")
          .map((row) => ({
            accountId: row.accountId,
            displayName: row.displayName,
            role: row.role,
            isMe: row.accountId === me,
            assignedAccountIds: assignments
              .filter((assignment) => assignment.accountId === row.accountId)
              .map((assignment) => assignment.threadsAccountId),
          }))
      : [],
    canAssign: isAdmin,
    canSeeStatus: scope !== null,
  };
}

/**
 * 担当を付け外しする（管理者だけ。相手は編集者か管理者で、運用アカウントの持ち主でない人。FR-T20）。
 * 付け直したときは、前の「承認を任せる」は戻らない（行を作り直す）。
 * @param deps 土台が渡す道具
 * @param organizationId 組織の ID
 * @param admin 管理者の組織の人の行
 * @param input 運用アカウント・担当の人・付けるか
 * @param input.threadsAccountId 運用アカウント
 * @param input.accountId 担当の人
 * @param input.assigned 付けるか
 * @throws {AppError} 管理者でない（THREADS_TEAM_FORBIDDEN）・担当にできない（THREADS_ASSIGNMENT_NOT_ALLOWED）
 */
export async function setAssignment(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  organizationId: string,
  admin: OrganizationMembership,
  input: { threadsAccountId: string; accountId: string; assigned: boolean },
): Promise<void> {
  const { db } = deps;
  if (admin.role !== "admin") throw new AppError(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN);
  const [placement] = await db
    .select()
    .from(threadsOrganizationAccount)
    .where(
      and(
        eq(threadsOrganizationAccount.threadsAccountId, input.threadsAccountId),
        eq(threadsOrganizationAccount.organizationId, organizationId),
      ),
    )
    .limit(1);
  const person = await findMembership(db, organizationId, input.accountId);
  if (
    !placement ||
    !person ||
    person.role === "member" ||
    placement.ownerAccountId === input.accountId
  ) {
    throw new AppError(THREADS_ERRORS.THREADS_ASSIGNMENT_NOT_ALLOWED);
  }
  const key = and(
    eq(threadsAssignment.threadsAccountId, input.threadsAccountId),
    eq(threadsAssignment.accountId, input.accountId),
  );
  const [existing] = await db.select().from(threadsAssignment).where(key).limit(1);
  const effective = existing ? assignmentEffective(person, existing.assignedAt) : false;
  if (input.assigned) {
    if (effective) return;
    // メンバーに下げる前の行が残っていれば作り直す（前の担当・任せるは戻らない。AD-22）
    if (existing) await db.delete(threadsAssignment).where(key);
    await db.insert(threadsAssignment).values({
      threadsAccountId: input.threadsAccountId,
      organizationId,
      accountId: input.accountId,
    });
  } else {
    if (!existing) return;
    await db.delete(threadsAssignment).where(key);
    if (!effective) return;
  }
  const names = await findDisplayNames(db, [input.accountId]);
  await recordTeamActivity(
    deps,
    input.threadsAccountId,
    input.assigned ? "assignment_added" : "assignment_removed",
    admin.accountId,
    names.get(input.accountId) ?? null,
  );
}

/**
 * Threads のはじめの画面に1回だけ出す知らせ（担当が付いた・退会で引き継いだ。FR-T52・FR-T66）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @returns 知らせ
 */
export async function listTeamNotices(
  db: Db,
  viewerAccountId: string,
): Promise<ThreadsTeamNotices> {
  const assigned = await db
    .select({
      account: threadsAccount,
      organizationId: threadsAssignment.organizationId,
      assignedAt: threadsAssignment.assignedAt,
    })
    .from(threadsAssignment)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsAssignment.threadsAccountId))
    .where(
      and(eq(threadsAssignment.accountId, viewerAccountId), isNull(threadsAssignment.noticeSeenAt)),
    )
    .orderBy(asc(threadsAssignment.assignedAt));
  const memberships = new Map(
    (await listMemberships(db, viewerAccountId)).map((row) => [row.organizationId, row]),
  );
  const effective = assigned.filter((row) =>
    assignmentEffective(memberships.get(row.organizationId) ?? null, row.assignedAt),
  );
  const names = await findDisplayNames(
    db,
    effective.map((row) => row.account.accountId),
  );
  const handovers = await db
    .select({
      id: threadsAccount.id,
      name: threadsAccount.name,
      fromName: threadsAccount.handoverFromName,
    })
    .from(threadsAccount)
    .where(
      and(
        eq(threadsAccount.accountId, viewerAccountId),
        isNotNull(threadsAccount.handoverFromName),
      ),
    )
    .orderBy(asc(threadsAccount.handedOverAt));
  return {
    assignments: effective.map((row) => ({
      threadsAccountId: row.account.id,
      accountName: row.account.name,
      ownerName: names.get(row.account.accountId) ?? "",
      organizationName: memberships.get(row.organizationId)?.organizationName ?? "",
    })),
    handovers: handovers.map((row) => ({
      threadsAccountId: row.id,
      accountName: row.name,
      fromName: row.fromName ?? "",
    })),
  };
}

/**
 * 知らせを見たことにする（担当の知らせは見た日時を残し、引き継ぎの知らせは前の持ち主の名前を消す）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 */
export async function markTeamNoticesSeen(db: Db, viewerAccountId: string): Promise<void> {
  await db
    .update(threadsAssignment)
    .set({ noticeSeenAt: sql`now()` })
    .where(
      and(eq(threadsAssignment.accountId, viewerAccountId), isNull(threadsAssignment.noticeSeenAt)),
    );
  await db
    .update(threadsAccount)
    .set({ handoverFromName: null })
    .where(
      and(
        eq(threadsAccount.accountId, viewerAccountId),
        isNotNull(threadsAccount.handoverFromName),
      ),
    );
}
