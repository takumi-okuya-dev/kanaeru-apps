// 割引の読み書き（表 event_discount は event の領域だけが読み書きする。AD-3・reception-002）。
// 割引は消さず、外すと archived_at を入れる（research R1）。並びの保存は、交流会を作る・直すのと同じ取引で呼ぶ。
// reception は index.ts の findEventDiscount・listEventDiscounts で読む（チェックインに名前と額を写す。AD-6）。
import type { EventDiscountInput, EventDiscountView } from "@workspace/contracts/event";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { eventDiscount } from "./schema.ts";

/** 割引の行（読み出す形）。 */
type EventDiscountRow = typeof eventDiscount.$inferSelect;

/** ほかの領域に出す割引（使うのをやめたかつき。reception がチェックインに写すときに読む）。 */
export type EventDiscountRecord = {
  /** 割引の ID */
  id: string;
  /** 交流会の ID */
  eventId: string;
  /** 名前 */
  name: string;
  /** 額（円の整数） */
  amount: number;
  /** 紹介者の名前を聞くか */
  asksReferrer: boolean;
  /** 使っているか（使うのをやめていれば false） */
  active: boolean;
};

/** 作った順（同じ時刻は ID の順）。 */
const CREATED_ORDER = [asc(eventDiscount.createdAt), asc(eventDiscount.id)] as const;

/**
 * 行を、ほかの領域に出す形にする。
 * @param row 割引の行
 * @returns 割引
 */
function toRecord(row: EventDiscountRow): EventDiscountRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    amount: row.amount,
    asksReferrer: row.asksReferrer,
    active: row.archivedAt === null,
  };
}

/**
 * 行を、交流会・要約に出す形にする（参加者に見せてよい欄だけ）。
 * @param row 割引の行
 * @returns 使っている割引
 */
function toView(row: EventDiscountRow): EventDiscountView {
  return { id: row.id, name: row.name, amount: row.amount, asksReferrer: row.asksReferrer };
}

/**
 * 交流会の使っている割引（作った順）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 使っている割引
 */
export async function listActiveDiscounts(
  db: Executor,
  eventId: string,
): Promise<EventDiscountView[]> {
  const rows = await db
    .select()
    .from(eventDiscount)
    .where(and(eq(eventDiscount.eventId, eventId), isNull(eventDiscount.archivedAt)))
    .orderBy(...CREATED_ORDER);
  return rows.map(toView);
}

/**
 * いくつかの交流会の使っている割引を1回で読む（交流会の一覧）。
 * @param db DB
 * @param eventIds 交流会の ID の並び
 * @returns 交流会の ID から使っている割引（割引のない交流会は入らない）
 */
export async function listActiveDiscountsByEvents(
  db: Executor,
  eventIds: readonly string[],
): Promise<Map<string, EventDiscountView[]>> {
  const byEvent = new Map<string, EventDiscountView[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await db
    .select()
    .from(eventDiscount)
    .where(and(inArray(eventDiscount.eventId, [...eventIds]), isNull(eventDiscount.archivedAt)))
    .orderBy(...CREATED_ORDER);
  for (const row of rows)
    byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), toView(row)]);
  return byEvent;
}

/**
 * 交流会の割引のすべて（使うのをやめたものも。作った順。ほかの領域も index.ts から使う：reception の内訳）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 割引の並び
 */
export async function listEventDiscounts(
  db: Executor,
  eventId: string,
): Promise<EventDiscountRecord[]> {
  const rows = await db
    .select()
    .from(eventDiscount)
    .where(eq(eventDiscount.eventId, eventId))
    .orderBy(...CREATED_ORDER);
  return rows.map(toRecord);
}

/**
 * その交流会の割引を ID で読む（使うのをやめたものも返す。ほかの領域も index.ts から使う：reception がチェックインに写すとき）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param discountId 割引の ID（uuid の形のもの）
 * @returns 割引。その交流会になければ null
 */
export async function findEventDiscount(
  db: Executor,
  eventId: string,
  discountId: string,
): Promise<EventDiscountRecord | null> {
  const [row] = await db
    .select()
    .from(eventDiscount)
    .where(and(eq(eventDiscount.eventId, eventId), eq(eventDiscount.id, discountId)))
    .limit(1);
  return row ? toRecord(row) : null;
}

/**
 * 割引の並びを保存する（送った並びが、その交流会で使う割引のすべて。research R2）。
 * id のある行は直す（使うのをやめていれば、また使う）、ない行は足す、使っている割引で並びにないものは使うのをやめる。
 * @param db DB（交流会を作る・直すのと同じ取引の中で呼ぶ）
 * @param eventId 交流会の ID
 * @param inputs 割引の並び（約束で確かめたもの）
 * @throws {AppError} 並びの id がその交流会の割引でないとき（DISCOUNT_NOT_FOUND）
 */
export async function saveDiscounts(
  db: Executor,
  eventId: string,
  inputs: readonly EventDiscountInput[],
): Promise<void> {
  const keepIds = inputs.flatMap((input) => (input.id ? [input.id] : []));
  if (keepIds.length > 0) {
    const found = await db
      .select({ id: eventDiscount.id })
      .from(eventDiscount)
      .where(and(eq(eventDiscount.eventId, eventId), inArray(eventDiscount.id, keepIds)));
    if (found.length !== new Set(keepIds).size) throw new AppError(EVENT_ERRORS.DISCOUNT_NOT_FOUND);
  }
  // 先に外してから直す・足す（並びの順に作った順がそろう）
  await db
    .update(eventDiscount)
    .set({ archivedAt: sql`now()` })
    .where(
      and(
        eq(eventDiscount.eventId, eventId),
        isNull(eventDiscount.archivedAt),
        ...(keepIds.length > 0 ? [notInArray(eventDiscount.id, keepIds)] : []),
      ),
    );
  for (const input of inputs) {
    const values = {
      name: input.name,
      amount: input.amount,
      asksReferrer: input.asksReferrer ?? false,
    };
    if (input.id) {
      await db
        .update(eventDiscount)
        .set({ ...values, archivedAt: null })
        .where(and(eq(eventDiscount.eventId, eventId), eq(eventDiscount.id, input.id)));
    } else {
      await db.insert(eventDiscount).values({ eventId, ...values });
    }
  }
}
