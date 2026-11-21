// 運用アカウントの関わりと、できることの判定（threads-013。PRD 組織 5.2・FR-T10）。
// 「誰がどの運用アカウントで何をできるか」はこのファイルだけで決め、すべての読み書きの窓口が通す（画面で隠すだけで済ませない）。
// - 関わりは上から順に、最初に当たったもの：持ち主 → 担当の人 → 組織の管理者（担当なし）→ チームの人（編集者〈担当なし〉・メンバー）
// - 運用アカウントは組織の中のチームに入る（threads-016）。組織の管理者はすべてのチームの運用アカウントに関わり、
//   ほかの組織の人は、運用アカウントが入っているチームの人のときだけ関わる
// - 関わりのない人（チームに入っていない運用アカウントの持ち主でない人・チームの外の人・別の組織の人）には、あることを知らせない（404）
// - 関わりはあるが権限が足りないときは 403（THREADS_TEAM_FORBIDDEN）
// - 組織の役割とチームの人かどうかは、要求のたびに suite の index.ts から引く（セッションに写さない。AD-22）
// - 担当と「承認を任せる」は、今の役割が編集者か管理者で、最後にメンバーに下げた日時より後に付けたものだけ効く（AD-22）
// - どの関わりでも、NG ワードの確かめと人による承認は省かない（承認の窓口は持ち主と同じ確かめを通る。FR-T11）
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import type { ThreadsAccountAccess, ThreadsRelation } from "@workspace/contracts/threads";
import { and, eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { findDisplayNames } from "../account/index.ts";
import { findMembership, findOrganization, findTeam, findTeamMembership } from "../suite/index.ts";
import type { OrganizationMembership } from "../suite/index.ts";
import type { ThreadsAccountRecord } from "./repository.ts";
import { threadsAccount, threadsAssignment, threadsOrganizationAccount } from "./schema.ts";

/**
 * 運用アカウントでの操作のまとまり（PRD 組織 5.2 の表の行）。
 * - read_content：運用アカウントの名前・投稿の案（一覧）・戦略を読む
 * - read_private：反応・分析・CSV・プロンプト・設定（読むだけ）・自動投稿の予定・ホームを見る
 * - write_content：投稿の案・戦略・改善のメモ・宣伝・参考の投稿・キーワードを作る・直す、承認待ちの案を消す
 * - review：承認・却下・承認を戻す・承認済みと却下の案を消す・次に投稿する・時間差のメンションを付ける
 * - manage：設定を変える・接続・消す・チームに入れる/外す・チームに見せる・承認を任せる（持ち主だけ）
 * - activity：操作の記録を見る
 * - team_card：「このアカウントのチーム」のカード
 */
export type ThreadsOperation =
  | "read_content"
  | "read_private"
  | "write_content"
  | "review"
  | "manage"
  | "activity"
  | "team_card";

/** 判定の結果（運用アカウントと関わり）。 */
export type AccountAccess = {
  account: ThreadsAccountRecord;
  relation: ThreadsRelation;
  /** 今の利用者 */
  viewerAccountId: string;
  /** 入っている組織と、今の利用者のその組織での役割（組織に入っていない・今の利用者が組織の人でなければ null） */
  organization: { id: string; name: string; myRole: OrganizationMembership["role"] } | null;
  /** 入っているチーム（チームに入っていない・今の利用者が関わる組織の人でなければ null） */
  team: { id: string; name: string } | null;
  /** 運用アカウントがチームに入っているか（今の利用者が組織の人かに関わらない） */
  placed: boolean;
  /** チームに見せているか */
  shared: boolean;
  /** 今の利用者が承認を任されているか */
  delegated: boolean;
};

/**
 * その日時より後に付けたか（最後にメンバーに下げた日時がなければ、いつでも効く）。
 * @param at 付けた日時
 * @param demotedAt 最後にメンバーに下げた日時
 * @returns 効くなら true
 */
function after(at: Date | null, demotedAt: Date | null): boolean {
  if (at === null) return false;
  return demotedAt === null || at > demotedAt;
}

/**
 * 担当が今も効くか（今の役割が編集者か管理者で、メンバーに下げた日時より後に付けたもの）。
 * @param membership 今の利用者の組織の人の行
 * @param assignedAt 担当を付けた日時
 * @returns 効くなら true
 */
export function assignmentEffective(
  membership: OrganizationMembership | null,
  assignedAt: Date | null,
): boolean {
  if (!membership || membership.role === "member") return false;
  return after(assignedAt, membership.demotedAt);
}

/**
 * 今の利用者と運用アカウントの関わりを決める（関わりがなければ null）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @param threadsAccountId 運用アカウントの ID
 * @returns 判定の結果（ない・関わりがなければ null）
 */
export async function resolveAccess(
  db: Executor,
  viewerAccountId: string,
  threadsAccountId: string,
): Promise<AccountAccess | null> {
  const [row] = await db
    .select({
      account: threadsAccount,
      organizationId: threadsOrganizationAccount.organizationId,
      teamId: threadsOrganizationAccount.teamId,
      shared: threadsOrganizationAccount.shared,
      assignedAt: threadsAssignment.assignedAt,
      delegated: threadsAssignment.delegated,
      delegatedAt: threadsAssignment.delegatedAt,
    })
    .from(threadsAccount)
    .leftJoin(
      threadsOrganizationAccount,
      eq(threadsOrganizationAccount.threadsAccountId, threadsAccount.id),
    )
    .leftJoin(
      threadsAssignment,
      and(
        eq(threadsAssignment.threadsAccountId, threadsAccount.id),
        eq(threadsAssignment.accountId, viewerAccountId),
      ),
    )
    .where(eq(threadsAccount.id, threadsAccountId))
    .limit(1);
  if (!row) return null;
  const isOwner = row.account.accountId === viewerAccountId;
  const organizationId = row.organizationId;
  const membership = organizationId
    ? await findMembership(db, organizationId, viewerAccountId)
    : null;
  const found = organizationId && membership ? await findOrganization(db, organizationId) : null;
  const organization =
    found && membership ? { id: found.id, name: found.name, myRole: membership.role } : null;
  const foundTeam = organization && row.teamId ? await findTeam(db, row.teamId) : null;
  const team = foundTeam ? { id: foundTeam.id, name: foundTeam.name } : null;
  const placed = organizationId !== null;
  const shared = row.shared === true;
  const base = { account: row.account, viewerAccountId, organization, team, placed, shared };
  if (isOwner) return { ...base, relation: "owner", delegated: false };
  if (!organization || !membership || !row.teamId) return null;
  // 担当の行は、担当の人がそのチームの人である間だけある（team_member への外部キー）
  if (assignmentEffective(membership, row.assignedAt)) {
    const delegated = row.delegated === true && after(row.delegatedAt, membership.demotedAt);
    return { ...base, relation: "assignee", delegated };
  }
  if (membership.role === "admin") return { ...base, relation: "org_admin", delegated: false };
  // 管理者でない組織の人は、運用アカウントが入っているチームの人のときだけ関わる（threads-016）
  if (!(await findTeamMembership(db, row.teamId, viewerAccountId))) return null;
  return { ...base, relation: "org_member", delegated: false };
}

/**
 * 関わりで、その操作をしてよいか（PRD 組織 5.2 の表）。
 * @param access 判定の結果
 * @param operation 操作のまとまり
 * @returns してよいなら true
 */
export function allows(access: AccountAccess, operation: ThreadsOperation): boolean {
  switch (access.relation) {
    case "owner":
      return true;
    case "assignee":
      switch (operation) {
        case "read_content":
        case "read_private":
        case "write_content":
        case "team_card":
          return true;
        case "review":
          return access.delegated;
        case "activity":
          return access.organization?.myRole === "admin";
        case "manage":
          return false;
      }
      return false;
    case "org_admin":
    case "org_member":
      // チームに見せているときだけ、投稿の案（一覧）と戦略を読むだけ
      return operation === "read_content" && access.shared;
  }
}

/**
 * 運用アカウントでの操作を判定する（すべての窓口が通す1か所。FR-T10）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @param threadsAccountId 運用アカウントの ID
 * @param operation 操作のまとまり
 * @returns 判定の結果
 * @throws {AppError} ない・関わりがない（NOT_FOUND）・権限が足りない（THREADS_TEAM_FORBIDDEN）
 */
export async function authorizeAccount(
  db: Executor,
  viewerAccountId: string,
  threadsAccountId: string,
  operation: ThreadsOperation,
): Promise<AccountAccess> {
  const access = await resolveAccess(db, viewerAccountId, threadsAccountId);
  if (!access) throw new AppError("NOT_FOUND");
  if (!allows(access, operation)) throw new AppError(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN);
  return access;
}

/**
 * 判定の結果を、画面に返す形にする（画面の出し分けに使う。判定の正は API）。
 * @param db DB
 * @param access 判定の結果
 * @returns 今の利用者が、この運用アカウントでできること
 */
export async function presentAccess(
  db: Executor,
  access: AccountAccess,
): Promise<ThreadsAccountAccess> {
  const names = await findDisplayNames(db, [access.account.accountId]);
  return {
    relation: access.relation,
    ownerName: names.get(access.account.accountId) ?? "",
    organization: access.organization,
    team: access.team,
    shared: access.shared,
    delegated: access.delegated,
    can: {
      readContent: allows(access, "read_content"),
      readPrivate: allows(access, "read_private"),
      writeContent: allows(access, "write_content"),
      review: allows(access, "review"),
      manage: allows(access, "manage"),
      activity: allows(access, "activity"),
    },
  };
}
