// 試合表の権限（AD-25：権限は match の1つの関数で決める。AD-19）。すべての窓口がここを通す。
// 作る・読む・直す・担当の端末を決める・消すのは、持ち主と、試合表を入れた組織の管理者・編集者だけ。組織のメンバーは開けない
// （【仮決め】research R2）。組織の役割は suite の index.ts から要求のたびに引き、セッションに写さない（AD-22）。
import { MATCH_ERRORS } from "@workspace/contracts/match";
import { eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { findMembership } from "../suite/index.ts";
import { matchTable, matchTableOrganization } from "./schema.ts";

/** 試合表を直せる組織の役割。 */
export const EDITING_ROLES: readonly string[] = ["admin", "editor"];

/** 権限を確かめた試合表。 */
export type TableAccess = {
  /** 試合表の ID */
  tableId: string;
  /** 持ち主 */
  ownerAccountId: string;
  /** 入れた組織（なければ null） */
  organizationId: string | null;
  /** 今の利用者が持ち主か */
  isOwner: boolean;
};

/**
 * 今の利用者が試合表を開けるか（直せるか）を確かめる。
 * @param db DB
 * @param tableId 試合表の ID
 * @param accountId 今の利用者
 * @param lock 試合表の行を押さえるか（書くトランザクションの中だけ）
 * @returns 権限を確かめた試合表
 * @throws {AppError} 試合表がない（MATCH_NOT_FOUND）・権限がない（MATCH_FORBIDDEN）
 */
export async function requireTableAccess(
  db: Executor,
  tableId: string,
  accountId: string,
  lock = false,
): Promise<TableAccess> {
  const query = db
    .select({
      ownerAccountId: matchTable.ownerAccountId,
      organizationId: matchTableOrganization.organizationId,
    })
    .from(matchTable)
    .leftJoin(matchTableOrganization, eq(matchTableOrganization.matchTableId, matchTable.id))
    .where(eq(matchTable.id, tableId));
  const [row] = lock ? await query.for("update", { of: matchTable }) : await query;
  if (!row) throw new AppError(MATCH_ERRORS.NOT_FOUND);
  const access = {
    tableId,
    ownerAccountId: row.ownerAccountId,
    organizationId: row.organizationId,
    isOwner: row.ownerAccountId === accountId,
  };
  if (access.isOwner) return access;
  if (row.organizationId) {
    const membership = await findMembership(db, row.organizationId, accountId);
    if (membership && EDITING_ROLES.includes(membership.role)) return access;
  }
  throw new AppError(MATCH_ERRORS.FORBIDDEN);
}
