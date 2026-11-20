// 契約があるか（AD-16・AD-22。PRD 組織 4.5）。契約の持ち主はアカウントか組織のどちらか1つ。
// 判定は suite のこの関数だけで行い、アプリは entitlement の表を読まない。売り始める前は、いつも使える（ENTITLEMENTS_ENFORCED）。
// 払うしくみ（支払いの会社・料金・席数）は売り始めるときに作る。今は持ち主の形と判定の形だけ。
import { and, eq, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { entitlement } from "./schema.ts";

/** 契約で止めるか（売り始めるときに true にする。今はどの機能も契約で止めない）。 */
export const ENTITLEMENTS_ENFORCED = false;

/** 契約を引く記録の持ち主と、記録を入れた組織。 */
export type EntitlementSubject = {
  /** 記録の持ち主（新しく作るときは作る人） */
  ownerAccountId: string;
  /** 記録を入れた組織（入れていなければ null） */
  organizationId: string | null;
};

/**
 * その記録で、そのアプリを使えるか（持ち主の個人の契約か、記録を入れた組織の契約のどちらかがあれば使える）。
 * 組織の契約は、組織に入れた記録にだけ効く（組織の人の個人の記録には効かない。PRD O5）。
 * 担当の人・見せてもらう人・参加者・受付係は契約を要らないので、持ち主と組織で引く。
 * @param db DB
 * @param subject 記録の持ち主と、記録を入れた組織
 * @param appKey アプリの key
 * @param enforced 契約で止めるか（既定は ENTITLEMENTS_ENFORCED。テストが判定を確かめるときだけ true を渡す）
 * @returns 使えるなら true
 */
export async function hasEntitlement(
  db: Executor,
  subject: EntitlementSubject,
  appKey: string,
  enforced: boolean = ENTITLEMENTS_ENFORCED,
): Promise<boolean> {
  if (!enforced) return true;
  const holders: SQL[] = [eq(entitlement.holderAccountId, subject.ownerAccountId)];
  if (subject.organizationId) {
    holders.push(eq(entitlement.holderOrganizationId, subject.organizationId));
  }
  const [row] = await db
    .select({ id: entitlement.id })
    .from(entitlement)
    .where(and(eq(entitlement.appKey, appKey), or(...holders)))
    .limit(1);
  return row !== undefined;
}
