// 交流会・受付係・招待のリンクの読み書き（表は event の領域だけが読み書きする。AD-3）。
// 受付係の表示名は account の findAccountById で引く（account の表を読まない。research R7）。
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { event, eventStaff, staffInvite } from "./schema.ts";

/** 交流会の行（読み出す形）。 */
export type EventRecord = typeof event.$inferSelect;

/** 交流会を作る・直すときの値（URL は null にそろえたもの）。 */
export type EventValues = {
  /** 名前 */
  name: string;
  /** 始まりの日時 */
  startsAt: Date;
  /** 会場 */
  venue: string;
  /** 参加費（円の整数） */
  fee: number;
  /** GoogleフォームのURL */
  googleFormUrl: string | null;
  /** LINEグループの招待リンク */
  lineGroupUrl: string | null;
};

/** 交流会の並び（日時の新しい順・同じ日時は作った順の新しい方。research R5）。 */
const NEWEST_FIRST = [desc(event.startsAt), desc(event.createdAt)] as const;

/**
 * 交流会を作る。
 * @param db DB
 * @param values 値
 * @returns 作った交流会
 */
export async function insertEvent(db: Executor, values: EventValues): Promise<EventRecord> {
  const [row] = await db.insert(event).values(values).returning();
  if (!row) throw new Error("作った交流会が返りませんでした。");
  return row;
}

/**
 * 交流会を直す。
 * @param db DB
 * @param id 交流会の ID
 * @param values 値
 * @returns 直した交流会。なければ null
 */
export async function updateEvent(
  db: Executor,
  id: string,
  values: EventValues,
): Promise<EventRecord | null> {
  const [row] = await db.update(event).set(values).where(eq(event.id, id)).returning();
  return row ?? null;
}

/**
 * アンケートを開く・閉じる。
 * @param db DB
 * @param id 交流会の ID
 * @param open 開くなら true
 * @returns 直した交流会。なければ null
 */
export async function setSurveyOpen(
  db: Executor,
  id: string,
  open: boolean,
): Promise<EventRecord | null> {
  const [row] = await db
    .update(event)
    .set({ surveyOpen: open })
    .where(eq(event.id, id))
    .returning();
  return row ?? null;
}

/**
 * 交流会を ID で読む。
 * @param db DB
 * @param id 交流会の ID（uuid の形のもの）
 * @returns 交流会。なければ null
 */
export async function findEventById(db: Executor, id: string): Promise<EventRecord | null> {
  const [row] = await db.select().from(event).where(eq(event.id, id)).limit(1);
  return row ?? null;
}

/**
 * すべての交流会（主催者の一覧）。
 * @param db DB
 * @returns 交流会の並び（新しい順）
 */
export function listAllEvents(db: Executor): Promise<EventRecord[]> {
  return db
    .select()
    .from(event)
    .orderBy(...NEWEST_FIRST);
}

/**
 * その人が受付係の交流会（受付係の一覧）。
 * @param db DB
 * @param accountId account の ID
 * @returns 交流会の並び（新しい順）
 */
export async function listStaffEvents(db: Executor, accountId: string): Promise<EventRecord[]> {
  const rows = await db
    .select({ event })
    .from(event)
    .innerJoin(eventStaff, eq(eventStaff.eventId, event.id))
    .where(eq(eventStaff.accountId, accountId))
    .orderBy(...NEWEST_FIRST);
  return rows.map((row) => row.event);
}

/**
 * 交流会があるかと、その人が受付係かを1回で読む（権限の確かめ。research R1）。
 * @param db DB
 * @param eventId 交流会の ID（uuid の形のもの）
 * @param accountId account の ID
 * @returns 交流会がなければ null。あれば受付係か
 */
export async function findEventMembership(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<{ isStaff: boolean } | null> {
  const [row] = await db
    .select({ staffId: eventStaff.id })
    .from(event)
    .leftJoin(
      eventStaff,
      and(eq(eventStaff.eventId, event.id), eq(eventStaff.accountId, accountId)),
    )
    .where(eq(event.id, eventId))
    .limit(1);
  return row ? { isStaff: row.staffId !== null } : null;
}

/**
 * 受付係にする（すでにいれば何もしない。同時の2回も一意の制約で1つ）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId account の ID
 */
export async function addStaff(db: Executor, eventId: string, accountId: string): Promise<void> {
  await db.insert(eventStaff).values({ eventId, accountId }).onConflictDoNothing();
}

/**
 * 受付係を外す。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId account の ID
 * @returns 外したら true、いなければ false
 */
export async function removeStaff(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await db
    .delete(eventStaff)
    .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.accountId, accountId)))
    .returning({ id: eventStaff.id });
  return rows.length > 0;
}

/**
 * 交流会の受付係（受付係になった順）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns account の ID と受付係になった時刻の並び
 */
export function listStaff(
  db: Executor,
  eventId: string,
): Promise<{ accountId: string; addedAt: Date }[]> {
  return db
    .select({ accountId: eventStaff.accountId, addedAt: eventStaff.createdAt })
    .from(eventStaff)
    .where(eq(eventStaff.eventId, eventId))
    .orderBy(asc(eventStaff.createdAt), asc(eventStaff.id));
}

/** 招待のリンクの行（読み出す形）。 */
export type StaffInviteRecord = {
  /** 招待の印 */
  token: string;
  /** 作った時刻 */
  createdAt: Date;
};

/**
 * 交流会の招待のリンクを読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 招待のリンク。なければ null
 */
export async function findInviteByEvent(
  db: Executor,
  eventId: string,
): Promise<StaffInviteRecord | null> {
  const [row] = await db
    .select({ token: staffInvite.token, createdAt: staffInvite.createdAt })
    .from(staffInvite)
    .where(eq(staffInvite.eventId, eventId))
    .limit(1);
  return row ?? null;
}

/**
 * 招待のリンクを作る・作り直す（交流会ごとに1本。前の印は使えなくなる）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param token 新しい印
 * @returns 招待のリンク
 */
export async function upsertInvite(
  db: Executor,
  eventId: string,
  token: string,
): Promise<StaffInviteRecord> {
  const [row] = await db
    .insert(staffInvite)
    .values({ eventId, token })
    .onConflictDoUpdate({
      target: staffInvite.eventId,
      set: { token, createdAt: sql`now()` },
    })
    .returning({ token: staffInvite.token, createdAt: staffInvite.createdAt });
  if (!row) throw new Error("作った招待のリンクが返りませんでした。");
  return row;
}

/**
 * 招待のリンクがあれば、印だけを替える（受付係を外したとき。前の印で受け直せないようにする。research R3）。
 * まだリンクがなければ何もしない（新しく作らない）。
 * @param db DB（受付係を外すのと同じ取引の中で呼ぶ）
 * @param eventId 交流会の ID
 * @param token 新しい印
 * @returns 替えたら true、リンクがなければ false
 */
export async function replaceInviteToken(
  db: Executor,
  eventId: string,
  token: string,
): Promise<boolean> {
  const rows = await db
    .update(staffInvite)
    .set({ token, createdAt: sql`now()` })
    .where(eq(staffInvite.eventId, eventId))
    .returning({ id: staffInvite.id });
  return rows.length > 0;
}

/**
 * 印から、招待のリンクの交流会を読む。
 * @param db DB
 * @param token 招待の印
 * @returns 交流会。知らない印なら null
 */
export async function findEventByInviteToken(
  db: Executor,
  token: string,
): Promise<EventRecord | null> {
  const [row] = await db
    .select({ event })
    .from(staffInvite)
    .innerJoin(event, eq(event.id, staffInvite.eventId))
    .where(eq(staffInvite.token, token))
    .limit(1);
  return row?.event ?? null;
}
