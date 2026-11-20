// 退会の手順の event の段（event-002。AD-19・AD-22 の (2)・AD-23）。suite の段のあとに、組み立て（app.ts）が流す。
// - 退会する人が持ち主で、組織に入れている交流会は、その組織の今の管理者に引き継ぐ（持ち主を替える）
// - 組織に入れていない交流会は、受付係・招待のリンク・割引ごと消す。チェックイン（参加者自身の記録）があると、reception の
//   外部キー（RESTRICT）で DB が止め、account の退会の窓口が 409 ACCOUNT_OWNS_SHARED_RECORDS を返す（research R2）
// - どちらも account を消すトランザクションの中（finalize）で行う。409 のときは引き継ぎも元に戻る（research R3）
// - suite の表には書かない（管理者は suite の index.ts から読むだけ）。reception の表は読まない
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { adminAfterWithdrawal, findOrganization, findOrganizationAdmin } from "../suite/index.ts";
import { event, eventDiscount, eventOrganization, eventStaff, staffInvite } from "./schema.ts";

/**
 * 組織に入れている交流会を、組織の今の管理者に引き継ぐ（管理者が退会する人のまま・いなければ何もしない）。
 * @param tx account を消すトランザクション
 * @param accountId 退会する人
 */
async function handOverPlacedEvents(tx: Executor, accountId: string): Promise<void> {
  const placed = await tx
    .select({ eventId: event.id, organizationId: eventOrganization.organizationId })
    .from(event)
    .innerJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .where(eq(event.ownerAccountId, accountId))
    .for("update");
  for (const row of placed) {
    const admin = await findOrganizationAdmin(tx, row.organizationId);
    if (!admin || admin.accountId === accountId) continue;
    await tx
      .update(event)
      .set({ ownerAccountId: admin.accountId })
      .where(eq(event.id, row.eventId));
    await tx
      .update(eventOrganization)
      .set({ ownerAccountId: admin.accountId })
      .where(eq(eventOrganization.eventId, row.eventId));
  }
}

/**
 * 組織に入れていない交流会を、子の行（受付係・招待のリンク・割引）ごと消す。
 * チェックインがある交流会は、外部キーで止まる（投げた誤りは account の窓口が 409 にする）。
 * @param tx account を消すトランザクション
 * @param accountId 退会する人
 */
async function deletePersonalEvents(tx: Executor, accountId: string): Promise<void> {
  const rows = await tx
    .select({ id: event.id })
    .from(event)
    .leftJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .where(and(eq(event.ownerAccountId, accountId), isNull(eventOrganization.eventId)));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await tx.delete(eventStaff).where(inArray(eventStaff.eventId, ids));
  await tx.delete(staffInvite).where(inArray(staffInvite.eventId, ids));
  await tx.delete(eventDiscount).where(inArray(eventDiscount.eventId, ids));
  await tx.delete(event).where(inArray(event.id, ids));
}

/** event の退会の手順。 */
export const eventWithdrawal: WithdrawalStep = {
  /**
   * 前の手順はない（引き継ぎと消すは finalize で、account を消すのと同じトランザクションで行う。research R3）。
   * @returns 終わり
   */
  prepare: () => Promise.resolve(),
  /**
   * 組織の交流会を引き継ぎ、個人の交流会を消す（suite の finalize のあと。2回流しても同じ結果）。
   * @param tx account を消すトランザクション
   * @param accountId 退会する人
   */
  finalize: async (tx, accountId) => {
    await handOverPlacedEvents(tx, accountId);
    await deletePersonalEvents(tx, accountId);
  },
  /**
   * 退会の確かめの中身（引き継がれる交流会と、消える交流会）。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身
   */
  preview: async (db, accountId) => {
    const owned = await db
      .select({
        name: event.name,
        organizationId: eventOrganization.organizationId,
      })
      .from(event)
      .leftJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
      .where(eq(event.ownerAccountId, accountId))
      .orderBy(desc(event.startsAt), asc(event.id));
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
        text: `交流会「${row.name}」は、${next.displayName || "名前のない人"}さん（組織「${organization?.name ?? ""}」の管理者）に引き継がれます。`,
      });
    }
    if (deleted.length > 0) {
      items.push({
        kind: "delete",
        text: `組織に入れていない交流会${deleted.length}件（${deleted.map((name) => `「${name}」`).join("・")}）と、その受付係・招待のリンク・割引を消します。チェックインのある交流会があると退会できません（先に組織に入れてください）。`,
      });
    }
    return items;
  },
};
