// 自前の申込みページの表の読み書き（booking-003。表は booking の領域だけが読み書きする。AD-3）：申込みページの設定の列・
// 本人の申込み・メールの申込み・案内の同意・確認の待ち。名前・メールアドレス・札はログに出さない。
// 名簿の答え（views.ts）は列を選んで作るので、ここで読む連絡のメールは名簿に出ない（research R14）。
import { and, asc, count, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { BookingMode, EntryStatus, Visibility } from "@workspace/contracts/booking";
import type { Executor } from "../../kernel/db.ts";
import { bookingConsent, bookingEmailRequest, bookingEntry, bookingSetting } from "./schema.ts";

/** 申込みページの設定（行がなければ受付だけ・閉じる・誰でも）。 */
export type PageSetting = { mode: BookingMode; accepting: boolean; visibility: Visibility };

/** 行がないときの設定。 */
const NO_SETTING: PageSetting = { mode: "reception", accepting: false, visibility: "public" };

/** 設定の列。 */
const settingColumns = {
  mode: bookingSetting.mode,
  accepting: bookingSetting.accepting,
  visibility: bookingSetting.visibility,
};

/**
 * 申込みページの設定を読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @param lock 押さえて読むか（申し込む・確定するとき。同じ交流会の申込みを順に流す）
 * @returns 設定
 */
export async function findPageSetting(
  db: Executor,
  eventId: string,
  lock = false,
): Promise<PageSetting> {
  const query = db
    .select(settingColumns)
    .from(bookingSetting)
    .where(eq(bookingSetting.eventId, eventId))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? NO_SETTING;
}

/**
 * 交流会の並びの申込みページの設定（部の予定）。
 * @param db DB
 * @param eventIds 交流会の ID
 * @returns 交流会の ID から設定（行のない交流会は入らない）
 */
export async function listPageSettings(
  db: Executor,
  eventIds: readonly string[],
): Promise<Map<string, PageSetting>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: bookingSetting.eventId, ...settingColumns })
    .from(bookingSetting)
    .where(inArray(bookingSetting.eventId, [...eventIds]));
  return new Map(rows.map(({ eventId, ...setting }) => [eventId, setting]));
}

/**
 * 受付を開く・閉じると見せる範囲を書く（行があるときだけ。使い方が自前かは呼ぶ側が確かめる）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param values 受付と見せる範囲
 */
export async function savePageSetting(
  db: Executor,
  eventId: string,
  values: { accepting: boolean; visibility: Visibility },
): Promise<void> {
  await db
    .update(bookingSetting)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(bookingSetting.eventId, eventId));
}

/** 申込み（参加者の窓口が読む列だけ。連絡のメールは読まない）。 */
export type SelfEntry = {
  id: string;
  eventId: string;
  name: string;
  status: EntryStatus;
  appliedAt: Date;
};

/** 申込みの列。 */
const selfEntryColumns = {
  id: bookingEntry.id,
  eventId: bookingEntry.eventId,
  name: bookingEntry.name,
  status: bookingEntry.status,
  appliedAt: bookingEntry.appliedAt,
};

/**
 * その交流会の本人の申込み。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId 本人
 * @param lock 押さえて読むか
 * @returns 申込み（なければ null）
 */
export async function findAccountEntry(
  db: Executor,
  eventId: string,
  accountId: string,
  lock = false,
): Promise<SelfEntry | null> {
  const query = db
    .select(selfEntryColumns)
    .from(bookingEntry)
    .where(and(eq(bookingEntry.eventId, eventId), eq(bookingEntry.accountId, accountId)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * 本人の最後の申込みの名前（名前の初めの値。research R4）。
 * @param db DB
 * @param accountId 本人
 * @returns 名前（なければ null）
 */
export async function findLatestAccountEntryName(
  db: Executor,
  accountId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: bookingEntry.name })
    .from(bookingEntry)
    .where(eq(bookingEntry.accountId, accountId))
    .orderBy(desc(bookingEntry.appliedAt), desc(bookingEntry.id))
    .limit(1);
  return row?.name ?? null;
}

/**
 * 本人の申込みのすべて（自分の申込みの一覧。交流会で絞るのは呼ぶ側）。
 * @param db DB
 * @param accountId 本人
 * @returns 申込み
 */
export function listAccountEntries(db: Executor, accountId: string): Promise<SelfEntry[]> {
  return db
    .select(selfEntryColumns)
    .from(bookingEntry)
    .where(eq(bookingEntry.accountId, accountId))
    .orderBy(asc(bookingEntry.appliedAt));
}

/**
 * ID で本人の申込みを読む（ほかの人の行は返さない）。
 * @param db DB
 * @param accountId 本人
 * @param entryId 行の ID
 * @param lock 押さえて読むか
 * @returns 申込み（なければ null）
 */
export async function findOwnEntry(
  db: Executor,
  accountId: string,
  entryId: string,
  lock = false,
): Promise<SelfEntry | null> {
  const query = db
    .select(selfEntryColumns)
    .from(bookingEntry)
    .where(and(eq(bookingEntry.id, entryId), eq(bookingEntry.accountId, accountId)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * 札の SHA-256 でメールの申込みを読む。
 * @param db DB
 * @param tokenHash 札の SHA-256
 * @param lock 押さえて読むか
 * @returns 申込み（なければ null）
 */
export async function findEntryByTokenHash(
  db: Executor,
  tokenHash: string,
  lock = false,
): Promise<SelfEntry | null> {
  const query = db
    .select(selfEntryColumns)
    .from(bookingEntry)
    .where(eq(bookingEntry.entryTokenHash, tokenHash))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * その交流会の、そのアドレスのメールの申込み。
 * @param db DB
 * @param eventId 交流会の ID
 * @param email メールアドレス（小文字）
 * @param lock 押さえて読むか
 * @returns 申込み（なければ null）
 */
export async function findEntryByContactEmail(
  db: Executor,
  eventId: string,
  email: string,
  lock = false,
): Promise<SelfEntry | null> {
  const query = db
    .select(selfEntryColumns)
    .from(bookingEntry)
    .where(and(eq(bookingEntry.eventId, eventId), eq(bookingEntry.contactEmail, email)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/** 自前の申込みを作るときの値。 */
export type NewSelfEntry = {
  eventId: string;
  name: string;
  /** LINE で申し込んだ人（メールの申込みは null） */
  accountId: string | null;
  /** メールの申込みの連絡のメール */
  contactEmail: string | null;
  /** メールの申込みの札の SHA-256 */
  entryTokenHash: string | null;
};

/**
 * 自前の申込みを作る（入口は自前・媒体は直接・確定。research R4）。
 * @param db DB
 * @param values 値
 * @returns 作った申込み
 */
export async function insertSelfEntry(db: Executor, values: NewSelfEntry): Promise<SelfEntry> {
  const [row] = await db
    .insert(bookingEntry)
    .values({
      ...values,
      applicationSource: "direct",
      entryKind: "self_page",
      status: "confirmed",
      enteredBy: values.accountId,
    })
    .returning(selfEntryColumns);
  if (!row) throw new Error("申込みを作れませんでした。");
  return row;
}

/**
 * 申込みを確定に戻す（申し込み直し。申し込んだ日時を今にする。メールの申込みは札を替える）。
 * @param db DB
 * @param entryId 行の ID
 * @param values 名前と、替える札
 * @param values.name 名前
 * @param values.entryTokenHash 新しい札の SHA-256（メールの申込みのとき）
 * @returns 直した申込み
 */
export async function reconfirmEntry(
  db: Executor,
  entryId: string,
  values: { name: string; entryTokenHash?: string },
): Promise<SelfEntry> {
  const [row] = await db
    .update(bookingEntry)
    .set({ ...values, status: "confirmed", appliedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(bookingEntry.id, entryId))
    .returning(selfEntryColumns);
  if (!row) throw new Error("申込みを直せませんでした。");
  return row;
}

/**
 * メールの申込みの札と名前を替える（もう確定の申込みに、新しい確認の札で確定したとき。申し込んだ日時は変えない）。
 * @param db DB
 * @param entryId 行の ID
 * @param values 名前と新しい札の SHA-256
 * @param values.name 名前
 * @param values.entryTokenHash 新しい札の SHA-256
 * @returns 直した申込み
 */
export async function replaceEntryToken(
  db: Executor,
  entryId: string,
  values: { name: string; entryTokenHash: string },
): Promise<SelfEntry> {
  const [row] = await db
    .update(bookingEntry)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(bookingEntry.id, entryId))
    .returning(selfEntryColumns);
  if (!row) throw new Error("申込みを直せませんでした。");
  return row;
}

/**
 * 申込みを取り消しにする。
 * @param db DB
 * @param entryId 行の ID
 * @returns 直した申込み
 */
export async function cancelEntryRow(db: Executor, entryId: string): Promise<SelfEntry> {
  const [row] = await db
    .update(bookingEntry)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(eq(bookingEntry.id, entryId))
    .returning(selfEntryColumns);
  if (!row) throw new Error("申込みを直せませんでした。");
  return row;
}

/**
 * 交流会の並びの、本人の申込みの状態（部の予定）。
 * @param db DB
 * @param accountId 本人
 * @param eventIds 交流会の ID
 * @returns 交流会の ID から状態
 */
export async function listAccountStatuses(
  db: Executor,
  accountId: string,
  eventIds: readonly string[],
): Promise<Map<string, EntryStatus>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: bookingEntry.eventId, status: bookingEntry.status })
    .from(bookingEntry)
    .where(
      and(eq(bookingEntry.accountId, accountId), inArray(bookingEntry.eventId, [...eventIds])),
    );
  return new Map(rows.map((row) => [row.eventId, row.status]));
}

/**
 * 本人の申込みの数（退会の確かめ）。
 * @param db DB
 * @param accountId 本人
 * @returns 数
 */
export async function countAccountEntries(db: Executor, accountId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookingEntry)
    .where(eq(bookingEntry.accountId, accountId));
  return row?.value ?? 0;
}

// ---- 案内の同意 ----

/** 同意の相手（組織か持ち主）。 */
export type ConsentHolder =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

/**
 * 相手の列の条件。
 * @param holder 相手
 * @returns 条件
 */
function holderCondition(holder: ConsentHolder) {
  return holder.kind === "organization"
    ? eq(bookingConsent.organizationId, holder.organizationId)
    : eq(bookingConsent.ownerAccountId, holder.accountId);
}

/**
 * 本人が相手に同意しているか。
 * @param db DB
 * @param accountId 本人
 * @param holder 相手
 * @returns 同意していれば true
 */
export async function hasConsent(
  db: Executor,
  accountId: string,
  holder: ConsentHolder,
): Promise<boolean> {
  const [row] = await db
    .select({ id: bookingConsent.id })
    .from(bookingConsent)
    .where(and(eq(bookingConsent.accountId, accountId), holderCondition(holder)))
    .limit(1);
  return row !== undefined;
}

/**
 * 同意を作る（あれば何もしない）。
 * @param db DB
 * @param accountId 本人
 * @param holder 相手
 */
export async function insertConsent(
  db: Executor,
  accountId: string,
  holder: ConsentHolder,
): Promise<void> {
  await db
    .insert(bookingConsent)
    .values({
      accountId,
      organizationId: holder.kind === "organization" ? holder.organizationId : null,
      ownerAccountId: holder.kind === "personal" ? holder.accountId : null,
    })
    .onConflictDoNothing();
}

/**
 * 本人の同意の一覧（同意した順）。
 * @param db DB
 * @param accountId 本人
 * @returns 同意
 */
export function listConsents(
  db: Executor,
  accountId: string,
): Promise<{ id: string; organizationId: string | null; ownerAccountId: string | null }[]> {
  return db
    .select({
      id: bookingConsent.id,
      organizationId: bookingConsent.organizationId,
      ownerAccountId: bookingConsent.ownerAccountId,
    })
    .from(bookingConsent)
    .where(eq(bookingConsent.accountId, accountId))
    .orderBy(asc(bookingConsent.createdAt), asc(bookingConsent.id));
}

/**
 * 本人の同意を外す（ほかの人の同意は消さない）。
 * @param db DB
 * @param accountId 本人
 * @param consentId 同意の ID
 * @returns 消したら true
 */
export async function deleteConsent(
  db: Executor,
  accountId: string,
  consentId: string,
): Promise<boolean> {
  const rows = await db
    .delete(bookingConsent)
    .where(and(eq(bookingConsent.id, consentId), eq(bookingConsent.accountId, accountId)))
    .returning({ id: bookingConsent.id });
  return rows.length > 0;
}

/**
 * 本人の同意の数（退会の確かめ）。
 * @param db DB
 * @param accountId 本人
 * @returns 数
 */
export async function countConsents(db: Executor, accountId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookingConsent)
    .where(eq(bookingConsent.accountId, accountId));
  return row?.value ?? 0;
}

// ---- 確認の待ち（メールで申し込む） ----

/** 確認の待ち。 */
export type EmailRequestRecord = typeof bookingEmailRequest.$inferSelect;

/**
 * その交流会の期限切れの待ちを消す（新しい待ちを作るとき。定時の処理を足さない。research R10）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param now 今の時刻
 */
export async function deleteExpiredRequests(
  db: Executor,
  eventId: string,
  now: Date,
): Promise<void> {
  await db
    .delete(bookingEmailRequest)
    .where(and(eq(bookingEmailRequest.eventId, eventId), lte(bookingEmailRequest.expiresAt, now)));
}

/**
 * その交流会の期限内の待ちの数。
 * @param db DB
 * @param eventId 交流会の ID
 * @param now 今の時刻
 * @returns 数
 */
export async function countActiveRequests(
  db: Executor,
  eventId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookingEmailRequest)
    .where(and(eq(bookingEmailRequest.eventId, eventId), gt(bookingEmailRequest.expiresAt, now)));
  return row?.value ?? 0;
}

/**
 * 同じ交流会・同じアドレスの、いちばん新しい待ちの作った時刻。
 * @param db DB
 * @param eventId 交流会の ID
 * @param email メールアドレス（小文字）
 * @returns 作った時刻（なければ null）
 */
export async function findLatestRequestAt(
  db: Executor,
  eventId: string,
  email: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: bookingEmailRequest.createdAt })
    .from(bookingEmailRequest)
    .where(and(eq(bookingEmailRequest.eventId, eventId), eq(bookingEmailRequest.email, email)))
    .orderBy(desc(bookingEmailRequest.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/**
 * 同じ交流会・同じアドレスの待ちを消す（新しい札に替えるとき・確定したとき）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param email メールアドレス（小文字）
 */
export async function deleteRequestsOf(
  db: Executor,
  eventId: string,
  email: string,
): Promise<void> {
  await db
    .delete(bookingEmailRequest)
    .where(and(eq(bookingEmailRequest.eventId, eventId), eq(bookingEmailRequest.email, email)));
}

/**
 * 確認の待ちを作る。
 * @param db DB
 * @param values 値
 */
export async function insertRequest(
  db: Executor,
  values: {
    eventId: string;
    name: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  },
): Promise<void> {
  await db.insert(bookingEmailRequest).values(values);
}

/**
 * 札の SHA-256 で確認の待ちを読む。
 * @param db DB
 * @param tokenHash 札の SHA-256
 * @param lock 押さえて読むか（確定するとき）
 * @returns 待ち（なければ null）
 */
export async function findRequestByHash(
  db: Executor,
  tokenHash: string,
  lock = false,
): Promise<EmailRequestRecord | null> {
  const query = db
    .select()
    .from(bookingEmailRequest)
    .where(eq(bookingEmailRequest.tokenHash, tokenHash))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}
