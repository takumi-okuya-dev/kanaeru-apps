// 退会の手順の threads の段（threads-013。AD-22 の (2)。PRD 組織 5.7・FR-O54）。
// suite の段（管理者の引き継ぎ・人のいない組織を消す）のあとに、組み立て（app.ts）が流す。suite の表には書かない。
// - 退会する人が持ち主で、まだ組織に入っている運用アカウントは、その組織の今の管理者に引き継ぐ（持ち主を替える）
//   Threads への接続は切る（トークンを消し「接続し直しが要る」にする。ユーザー名は表示のために残す）。自動投稿は切、
//   時間差のメンションの待ちは取り消す。新しい持ち主の担当の行は消し、ほかの人の担当は残す。「承認を任せる」「チームに見せる」はオフに戻す
// - 運用アカウントは同じチームに残る。新しい持ち主がそのチームにいなければ、suite の addTeamMember でチームに入れてから持ち主を替える（threads-016）
// - 組織に入っていない運用アカウントは、このあと account がアカウントを消すときに CASCADE で消える（ここでは消さない）
// - 運用アカウントごとのトランザクションで行い、2回流しても同じ結果になる（済んだものは持ち主が替わっている）
import type { Db } from "../../kernel/db.ts";
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { findDisplayNames } from "../account/index.ts";
import {
  addTeamMember,
  adminAfterWithdrawal,
  findOrganization,
  findOrganizationAdmin,
} from "../suite/index.ts";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { skipUnsentAttempts } from "./connection.ts";
import { lockKey } from "./locks.ts";
import {
  threadsAccount,
  threadsActivityLog,
  threadsAssignment,
  threadsConnection,
  threadsOrganizationAccount,
  threadsPostMention,
  threadsPostingSchedule,
} from "./schema.ts";

/**
 * 1つの運用アカウントを、組織の今の管理者に引き継ぐ（トランザクションの中で、済んでいれば何もしない）。
 * @param db DB
 * @param withdrawingAccountId 退会する人
 * @param threadsAccountId 運用アカウントの ID
 * @param fromName 前の持ち主の表示名（新しい持ち主への知らせに使う）
 */
async function handOverAccount(
  db: Db,
  withdrawingAccountId: string,
  threadsAccountId: string,
  fromName: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ account: threadsAccount, placement: threadsOrganizationAccount })
      .from(threadsAccount)
      .innerJoin(
        threadsOrganizationAccount,
        eq(threadsOrganizationAccount.threadsAccountId, threadsAccount.id),
      )
      .where(eq(threadsAccount.id, threadsAccountId))
      .for("update");
    if (!target || target.account.accountId !== withdrawingAccountId) return;
    const admin = await findOrganizationAdmin(tx, target.placement.organizationId);
    // 管理者がいない・退会する人のまま（suite の段がまだ）なら引き継がない（アカウントと一緒に消える）
    if (!admin || admin.accountId === withdrawingAccountId) return;
    const newOwner = admin.accountId;
    const now = new Date();
    // 新しい持ち主の作る数の鍵（同時に運用アカウントを作るのと食い違わない。上限を超えてもよい。PRD O19）
    await lockKey(tx, `threads_account:${newOwner}`);
    await skipUnsentAttempts(tx, threadsAccountId, now);
    await tx
      .delete(threadsConnection)
      .where(eq(threadsConnection.threadsAccountId, threadsAccountId));
    await tx
      .update(threadsPostingSchedule)
      .set({
        enabled: false,
        effectiveFrom: now,
        version: sql`${threadsPostingSchedule.version} + 1`,
      })
      .where(eq(threadsPostingSchedule.threadsAccountId, threadsAccountId));
    await tx
      .update(threadsPostMention)
      .set({ state: "canceled" })
      .where(
        and(
          eq(threadsPostMention.threadsAccountId, threadsAccountId),
          eq(threadsPostMention.state, "pending"),
          sql`${threadsPostMention.publishRequestedAt} IS NULL`,
        ),
      );
    await tx
      .update(threadsAccount)
      .set({
        accountId: newOwner,
        // つないでいたものは「接続し直しが要る」（ユーザー名は表示のために残す）。つないでいなければそのまま
        connectionStatus:
          target.account.connectionStatus === "not_connected" ? "not_connected" : "needs_reconnect",
        reconnectHint: null,
        connectionGeneration: sql`${threadsAccount.connectionGeneration} + 1`,
        lastOpenedAt: null,
        handedOverAt: now,
        handoverFromName: fromName,
      })
      .where(eq(threadsAccount.id, threadsAccountId));
    // 持ち主はチームの人でなければならない（team_member への外部キー）
    await addTeamMember(tx, target.placement.teamId, target.placement.organizationId, newOwner);
    await tx
      .update(threadsOrganizationAccount)
      .set({ ownerAccountId: newOwner, shared: false })
      .where(eq(threadsOrganizationAccount.threadsAccountId, threadsAccountId));
    // 新しい持ち主が自分で担当していた行は消す（持ち主になったため）。ほかの人の担当は残し、任せるはオフに戻す
    await tx
      .delete(threadsAssignment)
      .where(
        and(
          eq(threadsAssignment.threadsAccountId, threadsAccountId),
          eq(threadsAssignment.accountId, newOwner),
        ),
      );
    await tx
      .update(threadsAssignment)
      .set({ delegated: false, delegatedAt: null })
      .where(
        and(
          eq(threadsAssignment.threadsAccountId, threadsAccountId),
          ne(threadsAssignment.accountId, newOwner),
        ),
      );
    await tx.insert(threadsActivityLog).values({
      threadsAccountId,
      kind: "settings",
      action: "account_handed_over",
      summary: fromName.slice(0, 30),
      actorAccountId: null,
    });
  });
}

/**
 * 退会する人が持ち主で、組織に入っている運用アカウント（作った順）。
 * @param db DB
 * @param accountId 退会する人
 * @returns 運用アカウントと組織
 */
async function listPlacedOwned(db: Db, accountId: string) {
  return db
    .select({
      id: threadsAccount.id,
      name: threadsAccount.name,
      organizationId: threadsOrganizationAccount.organizationId,
    })
    .from(threadsAccount)
    .innerJoin(
      threadsOrganizationAccount,
      eq(threadsOrganizationAccount.threadsAccountId, threadsAccount.id),
    )
    .where(eq(threadsAccount.accountId, accountId))
    .orderBy(asc(threadsAccount.createdAt), asc(threadsAccount.id));
}

/** threads の退会の手順。 */
export const threadsWithdrawal: WithdrawalStep = {
  /**
   * 組織に入れていた運用アカウントを、組織の今の管理者に引き継ぐ（済んだものは飛ばす）。
   * @param db DB
   * @param accountId 退会する人
   */
  prepare: async (db, accountId) => {
    const placed = await listPlacedOwned(db, accountId);
    if (placed.length === 0) return;
    const names = await findDisplayNames(db, [accountId]);
    const fromName = names.get(accountId) || "名前のない人";
    for (const row of placed) await handOverAccount(db, accountId, row.id, fromName);
  },
  /**
   * 退会の確かめの中身（引き継がれる運用アカウントと、消える運用アカウント）。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身
   */
  preview: async (db, accountId) => {
    const owned = await db
      .select({
        id: threadsAccount.id,
        name: threadsAccount.name,
        organizationId: threadsOrganizationAccount.organizationId,
      })
      .from(threadsAccount)
      .leftJoin(
        threadsOrganizationAccount,
        eq(threadsOrganizationAccount.threadsAccountId, threadsAccount.id),
      )
      .where(eq(threadsAccount.accountId, accountId))
      .orderBy(asc(threadsAccount.createdAt), asc(threadsAccount.id));
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
        text: `運用アカウント「${row.name}」は、${next.displayName || "名前のない人"}さん（組織「${organization?.name ?? ""}」の管理者）に引き継がれます。Threads への接続は切れます。`,
      });
    }
    if (deleted.length > 0) {
      items.push({
        kind: "delete",
        text: `運用アカウント${deleted.length}件（${deleted.map((name) => `「${name}」`).join("・")}）と、その投稿の案・戦略・反応などを消します。`,
      });
    }
    return items;
  },
};
