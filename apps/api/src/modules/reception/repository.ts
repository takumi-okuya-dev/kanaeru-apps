// チェックインの読み書き（表は reception の領域だけが読み書きする。AD-3）。
// findCheckin・getCheckin・listCheckins は survey も index.ts から使う。
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { checkin } from "./schema.ts";

/** チェックインの行（読み出す形。ほかの領域も index.ts から使う）。 */
export type CheckinRecord = typeof checkin.$inferSelect;

/** チェックインを作るときの値。 */
export type NewCheckinValues = Omit<typeof checkin.$inferInsert, "id" | "createdAt" | "updatedAt">;

/** チェックインを直すときの値（名前・3つの選択肢・金額）。 */
export type CheckinChanges = Pick<
  CheckinRecord,
  "name" | "applicationSource" | "referral" | "paymentMethod" | "amount"
>;

/** 一覧の並び（新しい順・同じ時刻は ID の新しい順。research R6）。 */
const NEWEST_FIRST = [desc(checkin.createdAt), desc(checkin.id)] as const;

/** 書き出しの並び（古い順）。 */
const OLDEST_FIRST = [asc(checkin.createdAt), asc(checkin.id)] as const;

/**
 * その人の、その交流会のチェックインを読む（ほかの領域も index.ts から使う。survey が回答を受けるとき）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param accountId account の ID
 * @returns チェックイン。なければ null
 */
export async function findCheckin(
  db: Executor,
  eventId: string,
  accountId: string,
): Promise<CheckinRecord | null> {
  const [row] = await db
    .select()
    .from(checkin)
    .where(and(eq(checkin.eventId, eventId), eq(checkin.accountId, accountId)))
    .limit(1);
  return row ?? null;
}

/**
 * チェックインを ID で読む（ほかの領域も index.ts から使う）。
 * @param db DB
 * @param checkinId チェックインの ID（uuid の形のもの）
 * @returns チェックイン。なければ null
 */
export async function getCheckin(db: Executor, checkinId: string): Promise<CheckinRecord | null> {
  const [row] = await db.select().from(checkin).where(eq(checkin.id, checkinId)).limit(1);
  return row ?? null;
}

/**
 * その交流会のチェックイン（ほかの領域も index.ts から使う。困りごとの一覧の名前）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param order 並び（既定は新しい順。書き出しは古い順）
 * @returns チェックインの並び
 */
export function listCheckins(
  db: Executor,
  eventId: string,
  order: "newest" | "oldest" = "newest",
): Promise<CheckinRecord[]> {
  return db
    .select()
    .from(checkin)
    .where(eq(checkin.eventId, eventId))
    .orderBy(...(order === "newest" ? NEWEST_FIRST : OLDEST_FIRST));
}

/** 同じ名前の候補の行（同じ名前の印に要る列だけ）。 */
export type SameNameCandidate = Pick<CheckinRecord, "id" | "name" | "accountId">;

/**
 * 同じ名前の候補を探すときに消す空白（JavaScript の \s と同じ文字。約束の normalizeCheckinName に合わせる）。
 * PostgreSQL の正規表現の文字の書き方（\t・\uXXXX）で書き、値として渡す。
 */
const WHITESPACE_PATTERN =
  "[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+";

/**
 * その交流会で、そろえた名前（NFKC でそろえ、空白をすべて消したもの）が同じ行を DB で探す（同じ名前の印を1行だけ決めるとき）。
 * DB の NFKC は JavaScript と Unicode の版がずれうるので、呼ぶ側は normalizeCheckinName でもう一度確かめる。
 * @param db DB
 * @param eventId 交流会の ID
 * @param normalizedName normalizeCheckinName でそろえた名前
 * @returns 候補の行（id・name・accountId）
 */
export function listSameNameCandidates(
  db: Executor,
  eventId: string,
  normalizedName: string,
): Promise<SameNameCandidate[]> {
  return db
    .select({ id: checkin.id, name: checkin.name, accountId: checkin.accountId })
    .from(checkin)
    .where(
      and(
        eq(checkin.eventId, eventId),
        sql`regexp_replace(normalize(${checkin.name}, NFKC), ${WHITESPACE_PATTERN}, '', 'g') = ${normalizedName}`,
      ),
    );
}

/**
 * その人の前回のチェックイン（どの交流会でも、いちばん新しいもの）の名前と知ったきっかけ（初期値。AD-6・決定 A4）。
 * @param db DB
 * @param accountId account の ID
 * @returns 名前と知ったきっかけ。なければ null
 */
export async function findLatestOfAccount(
  db: Executor,
  accountId: string,
): Promise<Pick<CheckinRecord, "name" | "referral"> | null> {
  const [row] = await db
    .select({ name: checkin.name, referral: checkin.referral })
    .from(checkin)
    .where(eq(checkin.accountId, accountId))
    .orderBy(...NEWEST_FIRST)
    .limit(1);
  return row ?? null;
}

/**
 * チェックインを作る（同じ人の同じ交流会の2回目は、一意の制約の違反を投げる）。
 * @param db DB
 * @param values 値
 * @returns 作ったチェックイン
 * @throws {Error} 一意の制約の違反（kernel/pg-errors.ts の isUniqueViolation で見分ける）
 */
export async function insertCheckin(
  db: Executor,
  values: NewCheckinValues,
): Promise<CheckinRecord> {
  const [row] = await db.insert(checkin).values(values).returning();
  if (!row) throw new Error("作ったチェックインが返りませんでした。");
  return row;
}

/**
 * その交流会のチェックインを直す。
 * @param db DB
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @param changes 値
 * @returns 直したチェックイン。その交流会になければ null
 */
export async function updateCheckin(
  db: Executor,
  eventId: string,
  checkinId: string,
  changes: CheckinChanges,
): Promise<CheckinRecord | null> {
  const [row] = await db
    .update(checkin)
    .set(changes)
    .where(and(eq(checkin.id, checkinId), eq(checkin.eventId, eventId)))
    .returning();
  return row ?? null;
}

/**
 * その交流会のチェックインを消す（取り消し。AD-7）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns 消したら true、その交流会になければ false
 */
export async function deleteCheckin(
  db: Executor,
  eventId: string,
  checkinId: string,
): Promise<boolean> {
  const rows = await db
    .delete(checkin)
    .where(and(eq(checkin.id, checkinId), eq(checkin.eventId, eventId)))
    .returning({ id: checkin.id });
  return rows.length > 0;
}

/**
 * 支払い方法ごとの人数と金額の和（FR-12。チェックインのない支払い方法は返らない）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 支払い方法・人数・金額の並び
 */
export function sumByPaymentMethod(
  db: Executor,
  eventId: string,
): Promise<{ paymentMethod: CheckinRecord["paymentMethod"]; count: number; amount: number }[]> {
  return db
    .select({
      paymentMethod: checkin.paymentMethod,
      count: sql<number>`count(*)::int`,
      amount: sql<number>`coalesce(sum(${checkin.amount}), 0)::int`,
    })
    .from(checkin)
    .where(eq(checkin.eventId, eventId))
    .groupBy(checkin.paymentMethod);
}

/**
 * 申し込みの媒体ごと・知ったきっかけごとの人数（FR-13。チェックインのない選択肢は返らない）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 申し込みの媒体・知ったきっかけの組と人数の並び
 */
export function countBySourceAndReferral(
  db: Executor,
  eventId: string,
): Promise<
  {
    applicationSource: CheckinRecord["applicationSource"];
    referral: CheckinRecord["referral"];
    count: number;
  }[]
> {
  return db
    .select({
      applicationSource: checkin.applicationSource,
      referral: checkin.referral,
      count: sql<number>`count(*)::int`,
    })
    .from(checkin)
    .where(eq(checkin.eventId, eventId))
    .groupBy(checkin.applicationSource, checkin.referral);
}
