// 退会の手順の match の段（match-002。AD-19・AD-22 の (2)・AD-25）。suite の段のあとに、組み立て（app.ts）が流す。
// - 退会する人が持ち主で、組織に入れている試合表は、その組織の今の管理者に引き継ぐ（持ち主を替える）
// - 組織に入れていない試合表は、account を消すときに外部キー（CASCADE）で消える（受付の行も一緒に。ほかの人自身の記録は
//   ぶら下がらないので、409 にはならない）
// - 引き継ぎは account を消すトランザクションの中（finalize）で行う（event の段と同じ。research R9）
// - suite の表には書かない（管理者は suite の index.ts から読むだけ）
import { asc, desc, eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { adminAfterWithdrawal, findOrganization, findOrganizationAdmin } from "../suite/index.ts";
import { matchTable, matchTableOrganization } from "./schema.ts";

/**
 * 組織に入れている試合表を、組織の今の管理者に引き継ぐ（管理者が退会する人のまま・いなければ何もしない。2回流しても同じ）。
 * @param tx account を消すトランザクション
 * @param accountId 退会する人
 */
async function handOverPlacedTables(tx: Executor, accountId: string): Promise<void> {
  const placed = await tx
    .select({ tableId: matchTable.id, organizationId: matchTableOrganization.organizationId })
    .from(matchTable)
    .innerJoin(matchTableOrganization, eq(matchTableOrganization.matchTableId, matchTable.id))
    .where(eq(matchTable.ownerAccountId, accountId))
    .for("update", { of: matchTable });
  for (const row of placed) {
    const admin = await findOrganizationAdmin(tx, row.organizationId);
    if (!admin || admin.accountId === accountId) continue;
    await tx
      .update(matchTable)
      .set({ ownerAccountId: admin.accountId })
      .where(eq(matchTable.id, row.tableId));
    await tx
      .update(matchTableOrganization)
      .set({ ownerAccountId: admin.accountId })
      .where(eq(matchTableOrganization.matchTableId, row.tableId));
  }
}

/** match の退会の手順。 */
export const matchWithdrawal: WithdrawalStep = {
  /**
   * 前の手順はない（引き継ぎは finalize で、account を消すのと同じトランザクションで行う）。
   * @returns 終わり
   */
  prepare: () => Promise.resolve(),
  /**
   * 組織に入れた試合表を引き継ぐ（suite の finalize のあと。組織に入れていない試合表は account と一緒に消える）。
   * @param tx account を消すトランザクション
   * @param accountId 退会する人
   */
  finalize: async (tx, accountId) => {
    await handOverPlacedTables(tx, accountId);
  },
  /**
   * 退会の確かめの中身（引き継がれる試合表と、消える試合表）。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身
   */
  preview: async (db, accountId) => {
    const owned = await db
      .select({ name: matchTable.name, organizationId: matchTableOrganization.organizationId })
      .from(matchTable)
      .leftJoin(matchTableOrganization, eq(matchTableOrganization.matchTableId, matchTable.id))
      .where(eq(matchTable.ownerAccountId, accountId))
      .orderBy(desc(matchTable.playDate), asc(matchTable.id));
    const items: { kind: "handover" | "delete"; text: string }[] = [];
    const deleted: string[] = [];
    for (const row of owned) {
      const next = row.organizationId
        ? await adminAfterWithdrawal(db, row.organizationId, accountId)
        : null;
      if (!row.organizationId || !next) {
        deleted.push(row.name);
        continue;
      }
      const organization = await findOrganization(db, row.organizationId);
      items.push({
        kind: "handover",
        text: `試合表「${row.name}」は、${next.displayName || "名前のない人"}さん（組織「${organization?.name ?? ""}」の管理者）に引き継がれます。`,
      });
    }
    if (deleted.length > 0) {
      items.push({
        kind: "delete",
        text: `組織に入れていない試合表${deleted.length}件（${deleted.map((name) => `「${name}」`).join("・")}）を消します。`,
      });
    }
    return items;
  },
};
