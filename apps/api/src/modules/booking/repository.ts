// 予約の表の読み書き（表は booking の領域だけが読み書きする。AD-3）。名前はログに出さない。
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { BookingMode, EntryKind, EntryStatus } from "@workspace/contracts/booking";
import type { ApplicationSource } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { bookingDismissal, bookingEntry, bookingImportMapping, bookingSetting } from "./schema.ts";

/** 名簿の行（読み出す形）。 */
export type EntryRecord = typeof bookingEntry.$inferSelect;

/** 名簿の行を作るときの値。 */
export type NewEntryValues = {
  /** 交流会の ID */
  eventId: string;
  /** 名前 */
  name: string;
  /** 媒体 */
  applicationSource: ApplicationSource;
  /** 入口 */
  entryKind: EntryKind;
  /** 入れた人（取り込みでも入れた人を残す） */
  enteredBy: string | null;
  /** メモ */
  memo?: string | null;
  /** 当てたチェックイン（飛び入り） */
  checkinId?: string | null;
};

/** 名簿の並び（申し込んだ日時の古い順・同じ時刻は ID の古い順）。 */
const OLDEST_FIRST = [asc(bookingEntry.appliedAt), asc(bookingEntry.id)] as const;

/**
 * 交流会の使い方を読む（行がなければ受付だけ）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 使い方
 */
export async function findMode(db: Executor, eventId: string): Promise<BookingMode> {
  const [row] = await db
    .select({ mode: bookingSetting.mode })
    .from(bookingSetting)
    .where(eq(bookingSetting.eventId, eventId))
    .limit(1);
  return row?.mode ?? "reception";
}

/**
 * 使い方の行を押さえて読む（取り込み・まとめるを同じ交流会で同時に流さないため。行がなければ押さえられない）。
 * @param tx トランザクション
 * @param eventId 交流会の ID
 * @returns 使い方（行がなければ受付だけ）
 */
export async function lockMode(tx: Executor, eventId: string): Promise<BookingMode> {
  const [row] = await tx
    .select({ mode: bookingSetting.mode })
    .from(bookingSetting)
    .where(eq(bookingSetting.eventId, eventId))
    .for("update");
  return row?.mode ?? "reception";
}

/**
 * 交流会の使い方を書く（行がなければ作る）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param mode 使い方
 */
export async function saveMode(db: Executor, eventId: string, mode: BookingMode): Promise<void> {
  await db
    .insert(bookingSetting)
    .values({ eventId, mode })
    .onConflictDoUpdate({ target: bookingSetting.eventId, set: { mode, updatedAt: sql`now()` } });
}

/**
 * 交流会の名簿の行の数（隠れている行も数える）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 行の数
 */
export async function countEntries(db: Executor, eventId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookingEntry)
    .where(eq(bookingEntry.eventId, eventId));
  return row?.value ?? 0;
}

/**
 * 交流会の名簿（申し込んだ日時の古い順）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 名簿の行
 */
export function listEntries(db: Executor, eventId: string): Promise<EntryRecord[]> {
  return db
    .select()
    .from(bookingEntry)
    .where(eq(bookingEntry.eventId, eventId))
    .orderBy(...OLDEST_FIRST);
}

/**
 * 交流会の名簿の行を ID で読む（ほかの交流会の行は返さない）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @param lock 押さえて読むか（当てる・まとめるとき）
 * @returns 行。なければ null
 */
export async function findEntry(
  db: Executor,
  eventId: string,
  entryId: string,
  lock = false,
): Promise<EntryRecord | null> {
  const query = db
    .select()
    .from(bookingEntry)
    .where(and(eq(bookingEntry.id, entryId), eq(bookingEntry.eventId, eventId)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * そのチェックインに手で当てた行（なければ null）。
 * @param db DB
 * @param checkinId チェックインの ID
 * @returns 行
 */
export async function findEntryByCheckin(
  db: Executor,
  checkinId: string,
): Promise<EntryRecord | null> {
  const [row] = await db
    .select()
    .from(bookingEntry)
    .where(eq(bookingEntry.checkinId, checkinId))
    .limit(1);
  return row ?? null;
}

/**
 * 名簿の行を足す。
 * @param db DB
 * @param values 値
 * @returns 足した行
 * @throws {Error} 一意の制約の違反（同じチェックインがほかの行に当たっている。isUniqueViolation で見分ける）
 */
export async function insertEntry(db: Executor, values: NewEntryValues): Promise<EntryRecord> {
  const [row] = await db.insert(bookingEntry).values(values).returning();
  if (!row) throw new Error("足した名簿の行が返りませんでした。");
  return row;
}

/**
 * 名簿の行をまとめて足す（取り込み）。
 * @param db DB
 * @param values 値の並び
 */
export async function insertEntries(
  db: Executor,
  values: readonly NewEntryValues[],
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(bookingEntry).values([...values]);
}

/**
 * 名簿の行を直す（その交流会の行だけ）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @param changes 直す値
 * @returns 直した行。なければ null
 * @throws {Error} 一意の制約の違反（同じチェックインがほかの行に当たっている）
 */
export async function updateEntry(
  db: Executor,
  eventId: string,
  entryId: string,
  changes: Partial<{
    status: EntryStatus;
    checkinId: string | null;
    accountId: string | null;
    memo: string | null;
  }>,
): Promise<EntryRecord | null> {
  const [row] = await db
    .update(bookingEntry)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(bookingEntry.id, entryId), eq(bookingEntry.eventId, eventId)))
    .returning();
  return row ?? null;
}

/**
 * 名簿の行を消す（まとめるとき）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 */
export async function deleteEntry(db: Executor, eventId: string, entryId: string): Promise<void> {
  await db
    .delete(bookingEntry)
    .where(and(eq(bookingEntry.id, entryId), eq(bookingEntry.eventId, eventId)));
}

/**
 * 交流会のちがう人の組。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 組の並び
 */
export function listDismissals(
  db: Executor,
  eventId: string,
): Promise<{ checkinId: string; entryId: string }[]> {
  return db
    .select({ checkinId: bookingDismissal.checkinId, entryId: bookingDismissal.entryId })
    .from(bookingDismissal)
    .where(eq(bookingDismissal.eventId, eventId));
}

/**
 * ちがう人の組を足す（同じ組がもうあれば何もしない）。
 * @param db DB
 * @param values 交流会・チェックイン・行・した人
 * @param values.eventId 交流会の ID
 * @param values.checkinId チェックインの ID
 * @param values.entryId 行の ID
 * @param values.dismissedBy した人
 */
export async function insertDismissal(
  db: Executor,
  values: { eventId: string; checkinId: string; entryId: string; dismissedBy: string },
): Promise<void> {
  await db.insert(bookingDismissal).values(values).onConflictDoNothing();
}

/**
 * 持ち主の CSV の列の対応（新しく覚えた順）。
 * @param db DB
 * @param ownerAccountId 交流会の持ち主
 * @returns 対応の並び
 */
export function listImportMappings(
  db: Executor,
  ownerAccountId: string,
): Promise<{ headerKey: string; nameColumn: string; applicationSource: ApplicationSource }[]> {
  return db
    .select({
      headerKey: bookingImportMapping.headerKey,
      nameColumn: bookingImportMapping.nameColumn,
      applicationSource: bookingImportMapping.applicationSource,
    })
    .from(bookingImportMapping)
    .where(eq(bookingImportMapping.ownerAccountId, ownerAccountId))
    .orderBy(sql`${bookingImportMapping.updatedAt} desc`);
}

/**
 * 持ち主の CSV の列の対応を覚える（同じ見出しの並びは上書き）。
 * @param db DB
 * @param values 持ち主・見出しの並び・名前の列・媒体
 * @param values.ownerAccountId 交流会の持ち主
 * @param values.headerKey 見出しの並び（JSON の文字）
 * @param values.nameColumn 名前の列
 * @param values.applicationSource 媒体
 */
export async function saveImportMapping(
  db: Executor,
  values: {
    ownerAccountId: string;
    headerKey: string;
    nameColumn: string;
    applicationSource: ApplicationSource;
  },
): Promise<void> {
  await db
    .insert(bookingImportMapping)
    .values(values)
    .onConflictDoUpdate({
      target: [bookingImportMapping.ownerAccountId, bookingImportMapping.headerKey],
      set: {
        nameColumn: values.nameColumn,
        applicationSource: values.applicationSource,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * 交流会の名簿の行の数の合計（退会の確かめ。交流会の ID は event の listPersonalEventIds から渡す）。
 * @param db DB
 * @param eventIds 交流会の ID
 * @returns 行の数
 */
export async function countEntriesOfEvents(
  db: Executor,
  eventIds: readonly string[],
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(bookingEntry)
    .where(inArray(bookingEntry.eventId, [...eventIds]));
  return row?.value ?? 0;
}
