// 退会の手順の suite の段（AD-22 の (1)。PRD 組織 FR-O34・FR-O36・FR-O54）。
// 退会する人が管理者の組織を、いちばん長くいる人に引き継ぎ、誰もいなければ組織を消す。ほかの領域は呼ばない。
// アプリは、この段のあとに、記録を組織の今の管理者に引き継ぐ（確かめの中身では adminAfterWithdrawal で先を読む）。
import type { Executor } from "../../kernel/db.ts";
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { findDisplayNames } from "../account/index.ts";
import {
  findLongestMember,
  findOrganizationAdmin,
  handOverAdminOrganizations,
  listMemberships,
} from "./organizations.ts";

/**
 * その人が退会したあとの、その組織の管理者（退会の確かめの中身で、アプリが引き継ぐ先を決めるのに使う）。
 * 今の管理者がほかの人ならその人、退会する人が管理者なら、いちばん長くいる人。ほかに誰もいなければ null（組織が消える）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId 退会する人
 * @returns 管理者（組織が消えるなら null）
 */
export async function adminAfterWithdrawal(
  db: Executor,
  organizationId: string,
  accountId: string,
): Promise<{ accountId: string; displayName: string } | null> {
  const admin = await findOrganizationAdmin(db, organizationId);
  if (admin && admin.accountId !== accountId) return admin;
  const successor = await findLongestMember(db, organizationId, accountId);
  if (!successor) return null;
  const names = await findDisplayNames(db, [successor]);
  return { accountId: successor, displayName: names.get(successor) ?? "" };
}

/** suite の退会の手順（組み立てが、アプリより先に流す）。 */
export const suiteWithdrawal: WithdrawalStep = {
  prepare: handOverAdminOrganizations,
  /**
   * 退会の確かめの中身（入っている組織ごとに、抜ける・管理者を引き継ぐ・組織を消す）。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身
   */
  preview: async (db, accountId) => {
    const memberships = await listMemberships(db, accountId);
    const items = [];
    for (const row of memberships) {
      if (row.role !== "admin") {
        items.push({
          kind: "organization" as const,
          text: `組織「${row.organizationName}」から抜けます。`,
        });
        continue;
      }
      const next = await adminAfterWithdrawal(db, row.organizationId, accountId);
      items.push({
        kind: "organization" as const,
        text: next
          ? `組織「${row.organizationName}」の管理者を、${next.displayName || "名前のない人"}さんに引き継ぎます。`
          : `組織「${row.organizationName}」を消します（ほかに誰もいないため。組織に入れた記録も消えます）。`,
      });
    }
    return items;
  },
};
