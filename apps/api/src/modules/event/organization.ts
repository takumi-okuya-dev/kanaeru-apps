// 交流会を組織に入れる・外す（event-002。AD-23）。入れる・外すのは持ち主だけで、持ち主が入っている組織だけを選べる。
// 1つの交流会は1つの組織まで。入れ替えは同じトランザクションで外して入れる（交流会の行に鍵をかける）。
// 組織の人と名前は suite の index.ts から読む（suite の表に書かない。AD-22）。
import { EVENT_ERRORS } from "@workspace/contracts/event";
import type { EventOrganizationState } from "@workspace/contracts/event";
import { eq } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isForeignKeyViolation } from "../../kernel/pg-errors.ts";
import { findDisplayNames } from "../account/index.ts";
import { findMembership, findOrganization, listMemberships } from "../suite/index.ts";
import { event, eventOrganization } from "./schema.ts";

/**
 * 交流会の持ち主と組織の状態を読む（主催者が読む。選べる組織は持ち主のときだけ）。
 * @param db DB
 * @param eventId 交流会の ID（requireEventRole を通ったもの）
 * @param viewerAccountId 今の利用者
 * @returns 持ち主と組織の状態
 * @throws {AppError} 交流会がない（NOT_FOUND）
 */
export async function getEventOrganizationState(
  db: Executor,
  eventId: string,
  viewerAccountId: string,
): Promise<EventOrganizationState> {
  const [row] = await db
    .select({
      ownerAccountId: event.ownerAccountId,
      organizationId: eventOrganization.organizationId,
    })
    .from(event)
    .leftJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .where(eq(event.id, eventId))
    .limit(1);
  if (!row) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  const owner = row.ownerAccountId
    ? {
        accountId: row.ownerAccountId,
        displayName:
          (await findDisplayNames(db, [row.ownerAccountId])).get(row.ownerAccountId) ?? "",
      }
    : null;
  const found = row.organizationId ? await findOrganization(db, row.organizationId) : null;
  const isOwner = row.ownerAccountId === viewerAccountId;
  const options = isOwner
    ? (await listMemberships(db, viewerAccountId)).map((membership) => ({
        id: membership.organizationId,
        name: membership.organizationName,
      }))
    : [];
  return {
    owner,
    organization: found ? { id: found.id, name: found.name } : null,
    isOwner,
    options,
  };
}

/**
 * 交流会を組織に入れる・入れ替える・外す（持ち主だけ。今と同じなら何もしない）。
 * @param db DB
 * @param eventId 交流会の ID（requireEventRole で主催者と確かめたもの）
 * @param viewerAccountId 今の利用者
 * @param organizationId 入れる組織（null で外す）
 * @throws {AppError} 持ち主でない（EVENT_OWNER_ONLY）・持ち主が入っていない組織（EVENT_ORGANIZATION_NOT_FOUND）
 */
export async function placeEvent(
  db: Db,
  eventId: string,
  viewerAccountId: string,
  organizationId: string | null,
): Promise<void> {
  await db
    .transaction(async (tx) => {
      const [target] = await tx
        .select({ ownerAccountId: event.ownerAccountId })
        .from(event)
        .where(eq(event.id, eventId))
        .for("update");
      if (!target) throw new AppError(EVENT_ERRORS.NOT_FOUND);
      if (target.ownerAccountId !== viewerAccountId)
        throw new AppError(EVENT_ERRORS.EVENT_OWNER_ONLY);
      if (organizationId && !(await findMembership(tx, organizationId, viewerAccountId))) {
        throw new AppError(EVENT_ERRORS.EVENT_ORGANIZATION_NOT_FOUND);
      }
      const [current] = await tx
        .select({ organizationId: eventOrganization.organizationId })
        .from(eventOrganization)
        .where(eq(eventOrganization.eventId, eventId));
      if ((current?.organizationId ?? null) === organizationId) return;
      if (current) await tx.delete(eventOrganization).where(eq(eventOrganization.eventId, eventId));
      if (organizationId) {
        await tx
          .insert(eventOrganization)
          .values({ eventId, organizationId, ownerAccountId: viewerAccountId });
      }
    })
    .catch((error: unknown) => {
      // 確かめたあとに持ち主が組織を抜けた・組織が消えたときは、組織の人への外部キーで止まる
      if (isForeignKeyViolation(error))
        throw new AppError(EVENT_ERRORS.EVENT_ORGANIZATION_NOT_FOUND);
      throw error;
    });
}
