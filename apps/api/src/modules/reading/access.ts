// 読書記録の権限（AD-32・research R11：権限は reading の1つの決まりで「持ち主か」だけを見る。組織には入れない）。すべての窓口がここを通す。
// 本とマーカーは、持ち主（owner_account_id）が今の利用者のものだけを読む。ほかの人の記録・ない ID は、あると知らせず
// READING_NOT_FOUND にする（道の ID でも本文の ID でも同じ）。消したマーカーも、ないものとして扱う。
import { READING_ERRORS } from "@workspace/contracts/reading";
import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { readingBook, readingMarker } from "./schema.ts";

/** 持ち主を確かめた本の行。 */
export type OwnedBook = typeof readingBook.$inferSelect;

/** 持ち主を確かめたマーカーの行。 */
export type OwnedMarker = typeof readingMarker.$inferSelect;

/**
 * 持ち主のものだけを通す（なければ、ほかの人のものと同じに READING_NOT_FOUND）。
 * @param row 持ち主で絞って読んだ行（なければ undefined）
 * @returns 行
 * @throws {AppError} ない・ほかの人のもの（READING_NOT_FOUND）
 */
function ownedOrNotFound<T>(row: T | undefined): T {
  if (row === undefined) throw new AppError(READING_ERRORS.NOT_FOUND);
  return row;
}

/**
 * 今の利用者が持ち主の本を読む。
 * @param db DB
 * @param ownerAccountId 今の利用者
 * @param bookId 本の ID
 * @param lock 行を押さえるか（書くトランザクションの中だけ）
 * @returns 本の行
 * @throws {AppError} ない・ほかの人のもの（READING_NOT_FOUND）
 */
export async function requireOwnedBook(
  db: Executor,
  ownerAccountId: string,
  bookId: string,
  lock = false,
): Promise<OwnedBook> {
  const query = db
    .select()
    .from(readingBook)
    .where(and(eq(readingBook.id, bookId), eq(readingBook.ownerAccountId, ownerAccountId)));
  const [row] = lock ? await query.for("update") : await query;
  return ownedOrNotFound(row);
}

/**
 * 今の利用者が持ち主の、消していないマーカーを読み、本とマーカーの行を押さえる（書くトランザクションの中だけ）。
 * 押さえる順は、取りこみ・まとめると同じ「本 → マーカー」にそろえる（まとめる処理と同時に直す・消すと、直したことが消えたり、
 * 消したマーカーがまとめ先に戻ったりしないように）。
 * @param db DB（トランザクション）
 * @param ownerAccountId 今の利用者
 * @param markerId マーカーの ID
 * @returns マーカーの行
 * @throws {AppError} ない・消した・ほかの人のもの（READING_NOT_FOUND）
 */
export async function requireOwnedMarker(
  db: Executor,
  ownerAccountId: string,
  markerId: string,
): Promise<OwnedMarker> {
  const owned = and(
    eq(readingMarker.id, markerId),
    eq(readingMarker.ownerAccountId, ownerAccountId),
    isNull(readingMarker.deletedAt),
  );
  const [found] = await db
    .select({ bookId: readingMarker.bookId })
    .from(readingMarker)
    .where(owned);
  const { bookId } = ownedOrNotFound(found);
  await requireOwnedBook(db, ownerAccountId, bookId, true);
  const [row] = await db.select().from(readingMarker).where(owned).for("update");
  return ownedOrNotFound(row);
}
