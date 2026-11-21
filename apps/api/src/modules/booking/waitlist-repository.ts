// 定員・媒体の枠・キャンセル待ち・打診の表の読み書き（booking-004。表は booking の領域だけが読み書きする。AD-3）。
// 名前・メールアドレス・札はログに出さない。席を数える行は、状態・媒体・申し込んだ日時・待っている打診の期限だけを読む。
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type {
  BookingMode,
  EntryStatus,
  NoticeKind,
  NoticeMethod,
  NoticeResult,
  OfferStatus,
  QuotaSource,
} from "@workspace/contracts/booking";
import type { Executor } from "../../kernel/db.ts";
import {
  bookingEntry,
  bookingNotice,
  bookingOffer,
  bookingQuota,
  bookingSetting,
} from "./schema.ts";
import type { QuotaRow, SeatEntry } from "./seats.ts";

/** 定員とキャンセル待ちの設定。 */
export type WaitlistSetting = {
  mode: BookingMode;
  capacity: number | null;
  quotaReleasedAt: Date | null;
  cancelledAt: Date | null;
  notifiedStartsAt: Date | null;
  notifiedVenue: string | null;
  changeDetectedAt: Date | null;
  sameDayNotifiedAt: Date | null;
};

/** 設定の列。 */
const waitlistColumns = {
  mode: bookingSetting.mode,
  capacity: bookingSetting.capacity,
  quotaReleasedAt: bookingSetting.quotaReleasedAt,
  cancelledAt: bookingSetting.cancelledAt,
  notifiedStartsAt: bookingSetting.notifiedStartsAt,
  notifiedVenue: bookingSetting.notifiedVenue,
  changeDetectedAt: bookingSetting.changeDetectedAt,
  sameDayNotifiedAt: bookingSetting.sameDayNotifiedAt,
};

/**
 * 定員とキャンセル待ちの設定を読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @param lock 押さえて読むか（席を数えて書くとき。同じ交流会の処理を順に流す。research R5）
 * @returns 設定（行がなければ null）
 */
export async function findWaitlistSetting(
  db: Executor,
  eventId: string,
  lock = false,
): Promise<WaitlistSetting | null> {
  const query = db
    .select(waitlistColumns)
    .from(bookingSetting)
    .where(eq(bookingSetting.eventId, eventId))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * 設定の列を直す（行があるときだけ）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param values 直す値
 */
export async function updateWaitlistSetting(
  db: Executor,
  eventId: string,
  values: Partial<Omit<WaitlistSetting, "mode">>,
): Promise<void> {
  await db
    .update(bookingSetting)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(bookingSetting.eventId, eventId));
}

/**
 * 交流会の媒体の枠（媒体の並び）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 枠
 */
export async function listQuotas(db: Executor, eventId: string): Promise<QuotaRow[]> {
  return db
    .select({
      applicationSource: bookingQuota.applicationSource,
      seats: bookingQuota.seats,
      manageUrl: bookingQuota.manageUrl,
    })
    .from(bookingQuota)
    .where(eq(bookingQuota.eventId, eventId))
    .orderBy(asc(bookingQuota.applicationSource));
}

/**
 * 定員と枠を丸ごと置きかえる。
 * @param db DB（トランザクション）
 * @param eventId 交流会の ID
 * @param capacity 定員
 * @param quotas 枠
 */
export async function replaceCapacity(
  db: Executor,
  eventId: string,
  capacity: number | null,
  quotas: readonly { applicationSource: QuotaSource; seats: number; manageUrl: string | null }[],
): Promise<void> {
  await updateWaitlistSetting(db, eventId, { capacity });
  await db.delete(bookingQuota).where(eq(bookingQuota.eventId, eventId));
  if (quotas.length > 0) {
    await db.insert(bookingQuota).values(quotas.map((quota) => ({ ...quota, eventId })));
  }
}

/** 席を数える申込み（送り先を決める列つき。名前は読まない）。 */
export type SeatEntryRow = SeatEntry & {
  accountId: string | null;
  /** メールの申込みか（連絡のメールがあり、アカウントがない） */
  emailOnly: boolean;
  /** 待っている打診を手で作ったか */
  offerManual: boolean;
};

/**
 * 交流会の申込みを、席を数える形で読む（取り消しを含む。待っている打診の期限つき）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 申込み
 */
export async function listSeatEntries(db: Executor, eventId: string): Promise<SeatEntryRow[]> {
  const rows = await db
    .select({
      id: bookingEntry.id,
      status: bookingEntry.status,
      applicationSource: bookingEntry.applicationSource,
      appliedAt: bookingEntry.appliedAt,
      accountId: bookingEntry.accountId,
      contactEmail: bookingEntry.contactEmail,
      offerId: bookingOffer.id,
      offerDeadline: bookingOffer.deadline,
      offeredBy: bookingOffer.offeredBy,
    })
    .from(bookingEntry)
    .leftJoin(
      bookingOffer,
      and(eq(bookingOffer.entryId, bookingEntry.id), eq(bookingOffer.status, "pending")),
    )
    .where(eq(bookingEntry.eventId, eventId))
    .orderBy(asc(bookingEntry.appliedAt), asc(bookingEntry.id));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    applicationSource: row.applicationSource,
    appliedAt: row.appliedAt,
    offerDeadline: row.offerDeadline,
    accountId: row.accountId,
    emailOnly: row.accountId === null && row.contactEmail !== null,
    offerManual: row.offerId !== null && row.offeredBy !== null,
  }));
}

/**
 * 申込みの状態を変える。
 * @param db DB
 * @param entryId 申込みの ID
 * @param status 状態
 */
export async function setEntryStatus(
  db: Executor,
  entryId: string,
  status: EntryStatus,
): Promise<void> {
  await db
    .update(bookingEntry)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(bookingEntry.id, entryId));
}

/**
 * 期限の来た待っている打診を期限切れにし、その申込みを取り消しにする。
 * @param db DB（トランザクション）
 * @param eventId 交流会の ID
 * @param now 今の時刻
 * @returns 取り消しにした申込みの ID
 */
export async function expireDueOffers(db: Executor, eventId: string, now: Date): Promise<string[]> {
  const offers = await db
    .update(bookingOffer)
    .set({ status: "expired", respondedAt: now, tokenHash: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(bookingOffer.eventId, eventId),
        eq(bookingOffer.status, "pending"),
        lte(bookingOffer.deadline, now),
      ),
    )
    .returning({ entryId: bookingOffer.entryId });
  const ids = offers.map((offer) => offer.entryId);
  if (ids.length === 0) return [];
  const entries = await db
    .update(bookingEntry)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(and(inArray(bookingEntry.id, ids), eq(bookingEntry.status, "offered")))
    .returning({ id: bookingEntry.id });
  return entries.map((entry) => entry.id);
}

/**
 * 打診を作り、申込みを打診中にする。
 * @param db DB（トランザクション）
 * @param values 交流会・申込み・期限・返事の札・打診した人
 * @param values.eventId 交流会の ID
 * @param values.entryId 申込みの ID
 * @param values.deadline 期限
 * @param values.tokenHash 返事の札の SHA-256（メールの人）
 * @param values.offeredBy 手で打診した主催者（自動は null）
 */
export async function createOffer(
  db: Executor,
  values: {
    eventId: string;
    entryId: string;
    deadline: Date;
    tokenHash: string | null;
    offeredBy: string | null;
  },
): Promise<void> {
  await db.insert(bookingOffer).values(values);
  await setEntryStatus(db, values.entryId, "offered");
}

/**
 * 申込みの待っている打診を閉じる（参加・辞退・取り下げ。返事の札も空にする〈閉じた打診の札で、見る・取り消すをさせない。
 * booking-003 R10 と同じく、使い終わった札は使えなくする〉）。
 * @param db DB
 * @param entryId 申込みの ID
 * @param status 閉じた状態
 * @param now 今の時刻
 */
export async function closePendingOffer(
  db: Executor,
  entryId: string,
  status: Exclude<OfferStatus, "pending">,
  now: Date,
): Promise<void> {
  await db
    .update(bookingOffer)
    .set({ status, respondedAt: now, tokenHash: null, updatedAt: sql`now()` })
    .where(and(eq(bookingOffer.entryId, entryId), eq(bookingOffer.status, "pending")));
}

/**
 * 交流会の待っている打診をすべて取り下げる（中止）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param now 今の時刻
 */
export async function withdrawOffersOfEvent(
  db: Executor,
  eventId: string,
  now: Date,
): Promise<void> {
  await db
    .update(bookingOffer)
    .set({ status: "withdrawn", respondedAt: now, tokenHash: null, updatedAt: sql`now()` })
    .where(and(eq(bookingOffer.eventId, eventId), eq(bookingOffer.status, "pending")));
}

/**
 * 申込みのいちばん新しい打診の状態（期限切れで取り消されたかを見る）。
 * @param db DB
 * @param entryId 申込みの ID
 * @returns 状態（打診がなければ null）
 */
export async function findLatestOfferStatus(
  db: Executor,
  entryId: string,
): Promise<OfferStatus | null> {
  const [row] = await db
    .select({ status: bookingOffer.status })
    .from(bookingOffer)
    .where(eq(bookingOffer.entryId, entryId))
    .orderBy(desc(bookingOffer.createdAt), desc(bookingOffer.id))
    .limit(1);
  return row?.status ?? null;
}

/**
 * 返事の札の SHA-256 で、待っている打診の申込みを引く（閉じた打診の札は引かない）。
 * @param db DB
 * @param tokenHash 返事の札の SHA-256
 * @returns 申込みの ID（なければ null）
 */
export async function findEntryIdByOfferToken(
  db: Executor,
  tokenHash: string,
): Promise<string | null> {
  const [row] = await db
    .select({ entryId: bookingOffer.entryId })
    .from(bookingOffer)
    .where(and(eq(bookingOffer.tokenHash, tokenHash), eq(bookingOffer.status, "pending")))
    .limit(1);
  return row?.entryId ?? null;
}

/**
 * 交流会の取り消しでない申込み（変更と中止の知らせ）の ID と状態。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 申込み
 */
export function listActiveEntries(
  db: Executor,
  eventId: string,
): Promise<{ id: string; status: EntryStatus }[]> {
  return db
    .select({ id: bookingEntry.id, status: bookingEntry.status })
    .from(bookingEntry)
    .where(and(eq(bookingEntry.eventId, eventId), ne(bookingEntry.status, "cancelled")))
    .orderBy(asc(bookingEntry.appliedAt), asc(bookingEntry.id));
}

/**
 * 交流会の取り消しでない申込みを、すべて取り消しにする（中止）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 取り消しにした申込みの ID
 */
export async function cancelActiveEntries(db: Executor, eventId: string): Promise<string[]> {
  const rows = await db
    .update(bookingEntry)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(and(eq(bookingEntry.eventId, eventId), ne(bookingEntry.status, "cancelled")))
    .returning({ id: bookingEntry.id });
  return rows.map((row) => row.id);
}

/**
 * 申込みに送った知らせ（新しい順。種類・手段・結果・時刻だけ。research R13）。
 * @param db DB
 * @param entryId 申込みの ID
 * @param limit 上限
 * @returns 知らせ
 */
export function listNoticesOf(
  db: Executor,
  entryId: string,
  limit: number,
): Promise<{ kind: NoticeKind; method: NoticeMethod; result: NoticeResult; createdAt: Date }[]> {
  return db
    .select({
      kind: bookingNotice.kind,
      method: bookingNotice.method,
      result: bookingNotice.result,
      createdAt: bookingNotice.createdAt,
    })
    .from(bookingNotice)
    .where(eq(bookingNotice.entryId, entryId))
    .orderBy(desc(bookingNotice.createdAt), desc(bookingNotice.id))
    .limit(limit);
}

/**
 * 定期の仕事が見る交流会（自前で中止していない・待っている打診かキャンセル待ちがある・知らせた日時が近いか空）。
 * @param db DB
 * @param since 知らせた日時がこれより後なら見る
 * @returns 交流会の ID
 */
export async function listJobEventIds(db: Executor, since: Date): Promise<string[]> {
  const waiting = db
    .select({ eventId: bookingEntry.eventId })
    .from(bookingEntry)
    .where(inArray(bookingEntry.status, ["waitlisted", "offered"]));
  const rows = await db
    .select({ eventId: bookingSetting.eventId })
    .from(bookingSetting)
    .where(
      and(
        eq(bookingSetting.mode, "self_page"),
        isNull(bookingSetting.cancelledAt),
        or(
          isNull(bookingSetting.notifiedStartsAt),
          gte(bookingSetting.notifiedStartsAt, since),
          inArray(bookingSetting.eventId, waiting),
        ),
      ),
    )
    .orderBy(asc(bookingSetting.eventId));
  return rows.map((row) => row.eventId);
}

/** 待っている打診（名簿の行に出す）。 */
export type PendingOffer = { deadline: Date; manual: boolean };

/**
 * 交流会の待っている打診（名簿の行に出す）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 申込みの ID から打診
 */
export async function listPendingOffers(
  db: Executor,
  eventId: string,
): Promise<Map<string, PendingOffer>> {
  const rows = await db
    .select({
      entryId: bookingOffer.entryId,
      deadline: bookingOffer.deadline,
      offeredBy: bookingOffer.offeredBy,
    })
    .from(bookingOffer)
    .where(and(eq(bookingOffer.eventId, eventId), eq(bookingOffer.status, "pending")));
  return new Map(
    rows.map((row) => [row.entryId, { deadline: row.deadline, manual: row.offeredBy !== null }]),
  );
}
