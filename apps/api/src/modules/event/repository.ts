// 交流会・受付係・招待のリンクの読み書き（表は event の領域だけが読み書きする。AD-3）。
// 受付係の表示名は account の findAccountById で引く（account の表を読まない。research R7）。
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { event, eventOrganization, eventStaff, staffInvite, staffInviteViewer } from "./schema.ts";

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
 * @param ownerAccountId 持ち主（作った人。AD-23）
 * @returns 作った交流会
 */
export async function insertEvent(
  db: Executor,
  values: EventValues,
  ownerAccountId: string,
): Promise<EventRecord> {
  const [row] = await db
    .insert(event)
    .values({ ...values, ownerAccountId })
    .returning();
  if (!row) throw new Error("作った交流会が返りませんでした。");
  return row;
}

/**
 * 持ち主のない交流会（前の版のアプリで運営者が作ったもの）を、すべて運営者のものにする（research R1）。
 * 前の版で交流会を作れたのは運営者だけなので、持ち主のない交流会はすべて運営者のもの。2回流しても同じ。
 * 運営者かは呼ぶ側が決める（account の isOrganizer）。埋め終えて owner_account_id を NOT NULL にしたら消す。
 * @param db DB
 * @param operatorAccountId 運営者の account の ID
 * @returns 運営者のものにした数
 */
export async function claimLegacyEvents(db: Executor, operatorAccountId: string): Promise<number> {
  const rows = await db
    .update(event)
    .set({ ownerAccountId: operatorAccountId })
    .where(isNull(event.ownerAccountId))
    .returning({ id: event.id });
  return rows.length;
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
 * 交流会の持ち主の account を引く（ほかの領域も index.ts から使う。booking の列の対応を持ち主ごとに覚えるため。booking-001）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 持ち主の account の ID（交流会がない・持ち主のない今の交流会は null）
 */
export async function findEventOwnerAccountId(
  db: Executor,
  eventId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ownerAccountId: event.ownerAccountId })
    .from(event)
    .where(eq(event.id, eventId))
    .limit(1);
  return row?.ownerAccountId ?? null;
}

/** 一覧の行（交流会・入れた組織・今の利用者が受付係か）。 */
export type AccessibleEventRow = {
  event: EventRecord;
  organizationId: string | null;
  isStaff: boolean;
};

/**
 * 今の利用者が主催者か受付係の交流会（一覧。event-002 research R9）。主催者の交流会は、持ち主が自分か、
 * 管理者・編集者の組織に入れたもの。役目は呼ぶ側が決める（判定の1か所と同じ条件。access.ts）。
 * @param db DB
 * @param accountId 今の利用者
 * @param managedOrganizationIds 今の利用者が管理者・編集者の組織（suite の index.ts から引いたもの）
 * @returns 行の並び（日時の新しい順）
 */
export async function listAccessibleEvents(
  db: Executor,
  accountId: string,
  managedOrganizationIds: readonly string[],
): Promise<AccessibleEventRow[]> {
  const conditions: SQL[] = [eq(event.ownerAccountId, accountId), isNotNull(eventStaff.id)];
  if (managedOrganizationIds.length > 0) {
    conditions.push(inArray(eventOrganization.organizationId, [...managedOrganizationIds]));
  }
  const rows = await db
    .select({ event, organizationId: eventOrganization.organizationId, staffId: eventStaff.id })
    .from(event)
    .leftJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .leftJoin(
      eventStaff,
      and(eq(eventStaff.eventId, event.id), eq(eventStaff.accountId, accountId)),
    )
    .where(or(...conditions))
    .orderBy(...NEWEST_FIRST);
  return rows.map((row) => ({
    event: row.event,
    organizationId: row.organizationId,
    isStaff: row.staffId !== null,
  }));
}

/** 組織に入れた交流会の行（booking の部の予定。booking-003）。 */
export type OrganizationEventRow = { eventId: string; organizationId: string; startsAt: Date };

/**
 * 組織の並びに入れた交流会で、始まりが from 以後のもの（始まりの近い順。booking の部の予定が使う。booking-003 research R9）。
 * @param db DB
 * @param organizationIds 組織の ID の並び（空なら何も返さない）
 * @param from この時刻以後に始まるもの
 * @returns 交流会の ID・組織・始まり
 */
export async function listOrganizationEvents(
  db: Executor,
  organizationIds: readonly string[],
  from: Date,
): Promise<OrganizationEventRow[]> {
  if (organizationIds.length === 0) return [];
  return db
    .select({
      eventId: event.id,
      organizationId: eventOrganization.organizationId,
      startsAt: event.startsAt,
    })
    .from(event)
    .innerJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .where(
      and(
        inArray(eventOrganization.organizationId, [...organizationIds]),
        gte(event.startsAt, from),
      ),
    )
    .orderBy(asc(event.startsAt), asc(event.id));
}

/**
 * 判定に要る行を1回で読む（持ち主・入れた組織・その人が受付係か。access.ts の resolveEventAccess）。
 * @param db DB
 * @param eventId 交流会の ID（uuid の形のもの）
 * @param accountId account の ID
 * @returns 交流会がなければ null
 */
export async function findEventAccessRow(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<{
  ownerAccountId: string | null;
  organizationId: string | null;
  isStaff: boolean;
} | null> {
  const [row] = await db
    .select({
      ownerAccountId: event.ownerAccountId,
      organizationId: eventOrganization.organizationId,
      staffId: eventStaff.id,
    })
    .from(event)
    .leftJoin(eventOrganization, eq(eventOrganization.eventId, event.id))
    .leftJoin(
      eventStaff,
      and(eq(eventStaff.eventId, event.id), eq(eventStaff.accountId, accountId)),
    )
    .where(eq(event.id, eventId))
    .limit(1);
  return row
    ? {
        ownerAccountId: row.ownerAccountId,
        organizationId: row.organizationId,
        isStaff: row.staffId !== null,
      }
    : null;
}

/**
 * 交流会を入れた組織を読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 組織の ID（入れていなければ null）
 */
export async function findEventOrganizationId(
  db: Executor,
  eventId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: eventOrganization.organizationId })
    .from(eventOrganization)
    .where(eq(eventOrganization.eventId, eventId))
    .limit(1);
  return row?.organizationId ?? null;
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
 * 招待のリンクを主催者として見たことを残す（見るたびに時刻を新しくする）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId 見た人
 */
export async function recordInviteViewer(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<void> {
  await db
    .insert(staffInviteViewer)
    .values({ eventId, accountId })
    .onConflictDoUpdate({
      target: [staffInviteViewer.eventId, staffInviteViewer.accountId],
      set: { viewedAt: sql`now()` },
    });
}

/**
 * 今の招待のリンクを、主催者として見たことがあるか（見たあとにリンクを作り直していれば、見ていないとみなす）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId 人
 * @returns 見たことがあれば true
 */
export async function sawCurrentInvite(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: staffInviteViewer.id })
    .from(staffInviteViewer)
    .innerJoin(staffInvite, eq(staffInvite.eventId, staffInviteViewer.eventId))
    .where(
      and(
        eq(staffInviteViewer.eventId, eventId),
        eq(staffInviteViewer.accountId, accountId),
        gte(staffInviteViewer.viewedAt, staffInvite.createdAt),
      ),
    )
    .limit(1);
  return row !== undefined;
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
