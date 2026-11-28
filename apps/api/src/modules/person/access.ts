// 人物メモの権限（AD-31：権限は person の1つの決まりで「持ち主か」だけを見る。組織には入れない）。すべての窓口がここを通す。
// 人と会った場は、持ち主（owner_account_id）が今の利用者のものだけを読む。ほかの人の記録・ない ID は、あると知らせず
// PERSON_NOT_FOUND にする（道の ID でも本文の ID でも同じ）。書くトランザクションの中では行を押さえられる（lock）。
import { PERSON_ERRORS } from "@workspace/contracts/person";
import { and, eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { personMeeting, personNote } from "./schema.ts";

/** 持ち主を確かめた人の行（直す・書き足すときに要る欄をすべて持つ）。 */
export type OwnedNote = typeof personNote.$inferSelect;

/** 持ち主を確かめた会った場。 */
export type OwnedMeeting = {
  /** 会った場の ID */
  id: string;
  /** 名前 */
  name: string;
  /** 会った日（YYYY-MM-DD） */
  metOn: string;
};

/**
 * 持ち主のものだけを通す（なければ、ほかの人のものと同じに PERSON_NOT_FOUND）。
 * @param row 持ち主で絞って読んだ行（なければ undefined）
 * @returns 行
 * @throws {AppError} ない・ほかの人のもの（PERSON_NOT_FOUND）
 */
function ownedOrNotFound<T>(row: T | undefined): T {
  if (row === undefined) throw new AppError(PERSON_ERRORS.NOT_FOUND);
  return row;
}

/**
 * 今の利用者が持ち主の人を読む。
 * @param db DB
 * @param ownerAccountId 今の利用者
 * @param noteId 人の ID
 * @param lock 行を押さえるか（書くトランザクションの中だけ）
 * @returns 人の行
 * @throws {AppError} ない・ほかの人のもの（PERSON_NOT_FOUND）
 */
export async function requireOwnedNote(
  db: Executor,
  ownerAccountId: string,
  noteId: string,
  lock = false,
): Promise<OwnedNote> {
  const query = db
    .select()
    .from(personNote)
    .where(and(eq(personNote.id, noteId), eq(personNote.ownerAccountId, ownerAccountId)));
  const [row] = lock ? await query.for("update") : await query;
  return ownedOrNotFound(row);
}

/**
 * 今の利用者が持ち主の会った場を読む。
 * @param db DB
 * @param ownerAccountId 今の利用者
 * @param meetingId 会った場の ID
 * @param lock 行を押さえるか（書くトランザクションの中だけ。付けるあいだに消されないように）
 * @returns 会った場
 * @throws {AppError} ない・ほかの人のもの（PERSON_NOT_FOUND）
 */
export async function requireOwnedMeeting(
  db: Executor,
  ownerAccountId: string,
  meetingId: string,
  lock = false,
): Promise<OwnedMeeting> {
  const query = db
    .select({ id: personMeeting.id, name: personMeeting.name, metOn: personMeeting.metOn })
    .from(personMeeting)
    .where(and(eq(personMeeting.id, meetingId), eq(personMeeting.ownerAccountId, ownerAccountId)));
  const [row] = lock ? await query.for("share") : await query;
  return ownedOrNotFound(row);
}
