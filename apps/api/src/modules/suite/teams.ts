// 組織の中のチームの読み書き（suite-003。AD-22）。表は suite の領域だけが読み書きする（AD-3）。
// - チームの操作（作る・名前を直す・消す・人を足す・外す・リーダー）は組織の管理者だけ。判定は routes-team.ts（requireOrganizationRole）
// - チームの数は、組織の行に鍵（FOR UPDATE）をかけてから数える（同時に来ても超えない）
// - チームの人は組織の人だけ（organization_member への複合の外部キー）。組織から抜けると、その人のチームの行は CASCADE で消える
// - アプリの表（チームに入れる・担当）は触らない。チームが消える・人が外れると、外部キーの CASCADE で消える
import { ORGANIZATION_ERRORS, TEAM_LIMIT } from "@workspace/contracts/suite";
import type { OrganizationRole } from "@workspace/contracts/suite";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isForeignKeyViolation, isUniqueViolation } from "../../kernel/pg-errors.ts";
import { findDisplayNames } from "../account/index.ts";
import { organization, organizationMember, team, teamMember } from "./schema.ts";

/** チームの行。 */
export type TeamRecord = { id: string; organizationId: string; name: string; createdAt: Date };

/** チームの人の行。 */
export type TeamMembership = {
  teamId: string;
  organizationId: string;
  accountId: string;
  leader: boolean;
};

/** チームの人（表示名と組織の役割つき）。 */
export type NamedTeamMember = TeamMembership & { displayName: string; role: OrganizationRole };

/** チームと、その人。 */
export type TeamWithMembers = TeamRecord & { members: NamedTeamMember[] };

/** 役割の並び（リーダーの次に、管理者 → 編集者 → メンバー）。 */
const ROLE_ORDER: Record<OrganizationRole, number> = { admin: 0, editor: 1, member: 2 };

/**
 * チームを読む。
 * @param db DB
 * @param teamId チームの ID
 * @returns チーム（なければ null）
 */
export async function findTeam(db: Executor, teamId: string): Promise<TeamRecord | null> {
  const [row] = await db
    .select({
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      createdAt: team.createdAt,
    })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);
  return row ?? null;
}

/**
 * その人のチームの人の行。
 * @param db DB
 * @param teamId チームの ID
 * @param accountId account の ID
 * @returns チームの人の行（入っていなければ null）
 */
export async function findTeamMembership(
  db: Executor,
  teamId: string,
  accountId: string,
): Promise<TeamMembership | null> {
  const [row] = await db
    .select({
      teamId: teamMember.teamId,
      organizationId: teamMember.organizationId,
      accountId: teamMember.accountId,
      leader: teamMember.leader,
    })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.accountId, accountId)))
    .limit(1);
  return row ?? null;
}

/**
 * 組織のチームと、その人（作った順。人はリーダー → 組織の役割 → 表示名）。
 * @param db DB
 * @param organizationId 組織の ID
 * @returns チーム
 */
export async function listTeams(db: Executor, organizationId: string): Promise<TeamWithMembers[]> {
  const teams = await db
    .select({
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      createdAt: team.createdAt,
    })
    .from(team)
    .where(eq(team.organizationId, organizationId))
    .orderBy(asc(team.createdAt), asc(team.id));
  if (teams.length === 0) return [];
  const rows = await db
    .select({
      teamId: teamMember.teamId,
      organizationId: teamMember.organizationId,
      accountId: teamMember.accountId,
      leader: teamMember.leader,
      role: organizationMember.role,
    })
    .from(teamMember)
    .innerJoin(
      organizationMember,
      and(
        eq(organizationMember.organizationId, teamMember.organizationId),
        eq(organizationMember.accountId, teamMember.accountId),
      ),
    )
    .where(
      inArray(
        teamMember.teamId,
        teams.map((row) => row.id),
      ),
    );
  const names = await findDisplayNames(
    db,
    rows.map((row) => row.accountId),
  );
  return teams.map((row) => ({
    ...row,
    members: rows
      .filter((member) => member.teamId === row.id)
      .map((member) => ({ ...member, displayName: names.get(member.accountId) ?? "" }))
      .sort(
        (a, b) =>
          Number(b.leader) - Number(a.leader) ||
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.displayName.localeCompare(b.displayName, "ja"),
      ),
  }));
}

/**
 * その人が入っているチーム（組織の名前・チームの名前つき。組織の入った順 → チームを作った順）。
 * @param db DB
 * @param accountId account の ID
 * @returns チームの人の行
 */
export async function listTeamMemberships(
  db: Executor,
  accountId: string,
): Promise<(TeamMembership & { teamName: string; organizationName: string })[]> {
  return db
    .select({
      teamId: teamMember.teamId,
      organizationId: teamMember.organizationId,
      accountId: teamMember.accountId,
      leader: teamMember.leader,
      teamName: team.name,
      organizationName: organization.name,
    })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .innerJoin(organization, eq(organization.id, teamMember.organizationId))
    .innerJoin(
      organizationMember,
      and(
        eq(organizationMember.organizationId, teamMember.organizationId),
        eq(organizationMember.accountId, teamMember.accountId),
      ),
    )
    .where(eq(teamMember.accountId, accountId))
    .orderBy(asc(organizationMember.joinedAt), asc(team.createdAt), asc(team.id));
}

/**
 * 組織の中のチームを読む（別の組織のチームなら断る）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @returns チーム
 * @throws {AppError} ない・別の組織のチーム（TEAM_NOT_FOUND）
 */
async function requireTeamIn(
  db: Executor,
  organizationId: string,
  teamId: string,
): Promise<TeamRecord> {
  const found = await findTeam(db, teamId);
  if (!found || found.organizationId !== organizationId) {
    throw new AppError(ORGANIZATION_ERRORS.TEAM_NOT_FOUND);
  }
  return found;
}

/**
 * チームを作る（1つの組織に20まで。名前は組織の中で重ならない）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param name 名前（確かめたもの）
 * @returns 作ったチームの ID
 * @throws {AppError} 上限（TEAM_LIMIT）・同じ名前（TEAM_NAME_TAKEN）・組織がない（ORGANIZATION_NOT_FOUND）
 */
export async function createTeam(db: Db, organizationId: string, name: string): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update");
      if (!locked) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
      const [counted] = await tx
        .select({ n: count() })
        .from(team)
        .where(eq(team.organizationId, organizationId));
      if (Number(counted?.n ?? 0) >= TEAM_LIMIT) throw new AppError(ORGANIZATION_ERRORS.TEAM_LIMIT);
      const [created] = await tx
        .insert(team)
        .values({ organizationId, name })
        .returning({ id: team.id });
      if (!created) throw new Error("チームを作れませんでした。");
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(ORGANIZATION_ERRORS.TEAM_NAME_TAKEN);
    throw error;
  }
}

/**
 * チームの名前を直す。
 * @param db DB
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param name 名前（確かめたもの）
 * @throws {AppError} ない（TEAM_NOT_FOUND）・同じ名前（TEAM_NAME_TAKEN）
 */
export async function renameTeam(
  db: Executor,
  organizationId: string,
  teamId: string,
  name: string,
): Promise<void> {
  await requireTeamIn(db, organizationId, teamId);
  try {
    await db.update(team).set({ name, updatedAt: new Date() }).where(eq(team.id, teamId));
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(ORGANIZATION_ERRORS.TEAM_NAME_TAKEN);
    throw error;
  }
}

/**
 * チームを消す（チームの人と、アプリがチームに入れた記録は外部キーで消える。運用アカウントなどの記録そのものは残る）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @throws {AppError} ない（TEAM_NOT_FOUND）
 */
export async function deleteTeam(
  db: Executor,
  organizationId: string,
  teamId: string,
): Promise<void> {
  await requireTeamIn(db, organizationId, teamId);
  await db.delete(team).where(eq(team.id, teamId));
}

/**
 * チームに人を足す・リーダーを切り替える（相手は組織の人）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param accountId 足す人
 * @param leader リーダーにするか
 * @throws {AppError} チームがない（TEAM_NOT_FOUND）・組織の人でない（TEAM_MEMBER_NOT_FOUND）
 */
export async function setTeamMember(
  db: Executor,
  organizationId: string,
  teamId: string,
  accountId: string,
  leader: boolean,
): Promise<void> {
  await requireTeamIn(db, organizationId, teamId);
  try {
    await db
      .insert(teamMember)
      .values({ teamId, organizationId, accountId, leader })
      .onConflictDoUpdate({ target: [teamMember.teamId, teamMember.accountId], set: { leader } });
  } catch (error) {
    // 組織の人でない（organization_member への外部キー）・チームが同時に消えた
    if (isForeignKeyViolation(error)) {
      throw new AppError(ORGANIZATION_ERRORS.TEAM_MEMBER_NOT_FOUND);
    }
    throw error;
  }
}

/**
 * チームから人を外す（その人の、このチームでのアプリの担当は外部キーで消える）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param accountId 外す人
 * @throws {AppError} チームがない（TEAM_NOT_FOUND）・チームの人でない（TEAM_MEMBER_NOT_FOUND）
 */
export async function removeTeamMember(
  db: Executor,
  organizationId: string,
  teamId: string,
  accountId: string,
): Promise<void> {
  await requireTeamIn(db, organizationId, teamId);
  const removed = await db
    .delete(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.accountId, accountId)))
    .returning({ accountId: teamMember.accountId });
  if (removed.length === 0) throw new AppError(ORGANIZATION_ERRORS.TEAM_MEMBER_NOT_FOUND);
}

/**
 * チームに人を入れる（もう入っていれば何もしない。リーダーにはしない）。退会の引き継ぎで、新しい持ち主をチームに入れるために
 * アプリが呼ぶ（AD-22。アプリは suite の表に直に書かない）。相手が組織の人でなければ外部キーで失敗する。
 * @param db DB（トランザクションの中で呼んでよい）
 * @param teamId チームの ID
 * @param organizationId 組織の ID
 * @param accountId 入れる人
 */
export async function addTeamMember(
  db: Executor,
  teamId: string,
  organizationId: string,
  accountId: string,
): Promise<void> {
  await db
    .insert(teamMember)
    .values({ teamId, organizationId, accountId })
    .onConflictDoNothing({ target: [teamMember.teamId, teamMember.accountId] });
}
