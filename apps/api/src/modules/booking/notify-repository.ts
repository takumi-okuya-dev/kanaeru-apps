// 予約の知らせの表の読み書き（公式アカウントの設定・紐づけ・札・連絡のメールアドレス・知らせの記録。booking-002）。
// 表は booking の領域だけが読み書きする（AD-3）。鍵・札・宛先はログに出さない。
import { and, count, eq, gte, isNull, or } from "drizzle-orm";
import type {
  EntryStatus,
  NoticeKind,
  NoticeMethod,
  NoticeResult,
} from "@workspace/contracts/booking";
import type { Executor } from "../../kernel/db.ts";
import {
  bookingContact,
  bookingEntry,
  bookingLineChannel,
  bookingLineLink,
  bookingLineLinkToken,
  bookingNotice,
} from "./schema.ts";

/** 公式アカウントの設定の行。 */
export type ChannelRecord = typeof bookingLineChannel.$inferSelect;

/** 公式アカウントの設定の持ち主。 */
export type NotifyHolderRef =
  { kind: "personal"; accountId: string } | { kind: "organization"; organizationId: string };

/** LINE の値（包んだもの）。 */
export type SealedLineValues = {
  lineChannelId: string;
  channelSecretCiphertext: Uint8Array;
  channelSecretIv: Uint8Array;
  channelSecretKeyVersion: number;
  channelSecretTail: string;
  accessTokenCiphertext: Uint8Array;
  accessTokenIv: Uint8Array;
  accessTokenKeyVersion: number;
  accessTokenTail: string;
  basicId: string | null;
};

/** 紐づけの札の行。 */
export type LinkTokenRecord = typeof bookingLineLinkToken.$inferSelect;

/**
 * 持ち主の条件。
 * @param holder 持ち主
 * @returns where の条件
 */
function holderCondition(holder: NotifyHolderRef) {
  return holder.kind === "personal"
    ? eq(bookingLineChannel.holderAccountId, holder.accountId)
    : eq(bookingLineChannel.holderOrganizationId, holder.organizationId);
}

/**
 * 持ち主の設定を読む。
 * @param db DB
 * @param holder 持ち主
 * @param lock 行を押さえるか（トランザクションの中だけ）
 * @returns 設定（なければ null）
 */
export async function findChannelByHolder(
  db: Executor,
  holder: NotifyHolderRef,
  lock = false,
): Promise<ChannelRecord | null> {
  const query = db.select().from(bookingLineChannel).where(holderCondition(holder)).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * 設定を ID で読む（Webhook）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @returns 設定（なければ null）
 */
export async function findChannelById(
  db: Executor,
  channelId: string,
): Promise<ChannelRecord | null> {
  const [row] = await db
    .select()
    .from(bookingLineChannel)
    .where(eq(bookingLineChannel.id, channelId))
    .limit(1);
  return row ?? null;
}

/**
 * 持ち主の設定の行を、なければ作って押さえる（トランザクションの中で使う）。
 * @param db トランザクション
 * @param holder 持ち主
 * @returns 設定の行
 * @throws {Error} 作ったはずの行が読めないとき
 */
export async function ensureChannel(db: Executor, holder: NotifyHolderRef): Promise<ChannelRecord> {
  await db
    .insert(bookingLineChannel)
    .values(
      holder.kind === "personal"
        ? { holderAccountId: holder.accountId }
        : { holderOrganizationId: holder.organizationId },
    )
    .onConflictDoNothing();
  const row = await findChannelByHolder(db, holder, true);
  if (!row) throw new Error("公式アカウントの設定の行を作れませんでした。");
  return row;
}

/**
 * LINE の値を書く（null で消す）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param values 包んだ LINE の値（null なら LINE の値を消す）
 */
export async function writeLineValues(
  db: Executor,
  channelId: string,
  values: SealedLineValues | null,
): Promise<void> {
  const cleared = {
    lineChannelId: null,
    channelSecretCiphertext: null,
    channelSecretIv: null,
    channelSecretKeyVersion: null,
    channelSecretTail: null,
    accessTokenCiphertext: null,
    accessTokenIv: null,
    accessTokenKeyVersion: null,
    accessTokenTail: null,
    basicId: null,
  };
  await db
    .update(bookingLineChannel)
    .set({ ...(values ?? cleared), updatedAt: new Date() })
    .where(eq(bookingLineChannel.id, channelId));
}

/**
 * メールの返信先を書く。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param replyToEmail 返信先（null で消す）
 */
export async function writeReplyTo(
  db: Executor,
  channelId: string,
  replyToEmail: string | null,
): Promise<void> {
  await db
    .update(bookingLineChannel)
    .set({ replyToEmail, updatedAt: new Date() })
    .where(eq(bookingLineChannel.id, channelId));
}

/**
 * その設定の紐づけと札をすべて消す（チャネル ID が変わった・LINE の値を消した）。
 * @param db DB
 * @param channelId 設定の行の ID
 */
export async function clearLinksOfChannel(db: Executor, channelId: string): Promise<void> {
  await db.delete(bookingLineLink).where(eq(bookingLineLink.channelId, channelId));
  await db.delete(bookingLineLinkToken).where(eq(bookingLineLinkToken.channelId, channelId));
}

/**
 * 紐づいた人数。
 * @param db DB
 * @param channelId 設定の行の ID
 * @returns 人数
 */
export async function countLinks(db: Executor, channelId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookingLineLink)
    .where(eq(bookingLineLink.channelId, channelId));
  return row?.n ?? 0;
}

/**
 * ある時刻からあとに、LINE で送った数（今月の数）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param since 数え始める時刻
 * @returns 数
 */
export async function countLineSentSince(
  db: Executor,
  channelId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookingNotice)
    .where(
      and(
        eq(bookingNotice.channelId, channelId),
        eq(bookingNotice.method, "line"),
        eq(bookingNotice.result, "sent"),
        gte(bookingNotice.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/**
 * その人の紐づけを読む。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param accountId アカウント
 * @returns 公式アカウントから見える LINE のユーザー ID（なければ null）
 */
export async function findLinkedLineUser(
  db: Executor,
  channelId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ lineUserId: bookingLineLink.lineUserId })
    .from(bookingLineLink)
    .where(and(eq(bookingLineLink.channelId, channelId), eq(bookingLineLink.accountId, accountId)))
    .limit(1);
  return row?.lineUserId ?? null;
}

/**
 * その LINE の友だちの使っていない札を消す（新しい札を作る前・ブロック）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param lineUserId LINE のユーザー ID
 */
export async function deleteUnusedTokens(
  db: Executor,
  channelId: string,
  lineUserId: string,
): Promise<void> {
  await db
    .delete(bookingLineLinkToken)
    .where(
      and(
        eq(bookingLineLinkToken.channelId, channelId),
        eq(bookingLineLinkToken.lineUserId, lineUserId),
        isNull(bookingLineLinkToken.usedAt),
      ),
    );
}

/**
 * 札を足す。
 * @param db DB
 * @param values 設定・LINE のユーザー ID・札の SHA-256・期限
 */
export async function insertToken(
  db: Executor,
  values: { channelId: string; lineUserId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(bookingLineLinkToken).values(values);
}

/**
 * 札を SHA-256 で読む。
 * @param db DB
 * @param tokenHash 札の SHA-256
 * @param lock 行を押さえるか（トランザクションの中だけ）
 * @returns 札（なければ null）
 */
export async function findTokenByHash(
  db: Executor,
  tokenHash: string,
  lock = false,
): Promise<LinkTokenRecord | null> {
  const query = db
    .select()
    .from(bookingLineLinkToken)
    .where(eq(bookingLineLinkToken.tokenHash, tokenHash))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/**
 * 札を「使った」にする。
 * @param db DB
 * @param tokenId 札の行の ID
 * @param accountId 使った人
 * @param now 今の時刻
 */
export async function markTokenUsed(
  db: Executor,
  tokenId: string,
  accountId: string,
  now: Date,
): Promise<void> {
  await db
    .update(bookingLineLinkToken)
    .set({ usedAt: now, usedByAccountId: accountId })
    .where(eq(bookingLineLinkToken.id, tokenId));
}

/**
 * 紐づけを作る（同じ設定の、同じ LINE の友だちか同じアカウントの前の紐づけを置きかえる。research R16）。
 * @param db トランザクション
 * @param values 設定・LINE のユーザー ID・アカウント
 */
export async function replaceLink(
  db: Executor,
  values: { channelId: string; lineUserId: string; accountId: string },
): Promise<void> {
  await db
    .delete(bookingLineLink)
    .where(
      and(
        eq(bookingLineLink.channelId, values.channelId),
        or(
          eq(bookingLineLink.lineUserId, values.lineUserId),
          eq(bookingLineLink.accountId, values.accountId),
        ),
      ),
    );
  await db.insert(bookingLineLink).values(values);
}

/**
 * LINE の友だちの紐づけを消す（ブロック）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param lineUserId LINE のユーザー ID
 */
export async function deleteLinkOfLineUser(
  db: Executor,
  channelId: string,
  lineUserId: string,
): Promise<void> {
  await db
    .delete(bookingLineLink)
    .where(
      and(eq(bookingLineLink.channelId, channelId), eq(bookingLineLink.lineUserId, lineUserId)),
    );
}

/**
 * 知らせの記録を足す（本文・宛先は持たない）。
 * @param db DB
 * @param values 申込み・設定・種類・手段・結果
 */
export async function insertNotice(
  db: Executor,
  values: {
    entryId: string | null;
    channelId: string | null;
    kind: NoticeKind;
    method: NoticeMethod;
    result: NoticeResult;
  },
): Promise<void> {
  await db.insert(bookingNotice).values(values);
}

/**
 * 参加者の連絡のメールアドレスを読む。
 * @param db DB
 * @param accountId アカウント
 * @returns メールアドレス（なければ null）
 */
export async function findContactEmail(db: Executor, accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: bookingContact.email })
    .from(bookingContact)
    .where(eq(bookingContact.accountId, accountId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * 参加者の連絡のメールアドレスを入れる（あれば置きかえる）。
 * @param db DB
 * @param accountId アカウント
 * @param email メールアドレス（小文字）
 */
export async function upsertContactEmail(
  db: Executor,
  accountId: string,
  email: string,
): Promise<void> {
  await db
    .insert(bookingContact)
    .values({ accountId, email })
    .onConflictDoUpdate({
      target: bookingContact.accountId,
      set: { email, updatedAt: new Date() },
    });
}

/**
 * 参加者の連絡のメールアドレスを消す。
 * @param db DB
 * @param accountId アカウント
 */
export async function deleteContactEmail(db: Executor, accountId: string): Promise<void> {
  await db.delete(bookingContact).where(eq(bookingContact.accountId, accountId));
}

/**
 * 知らせの相手の申込みを読む。
 * @param db DB
 * @param entryId 申込みの ID
 * @returns 交流会・アカウント・状態（なければ null）
 */
export async function findEntryForNotice(
  db: Executor,
  entryId: string,
): Promise<{
  id: string;
  eventId: string;
  accountId: string | null;
  status: EntryStatus;
  contactEmail: string | null;
} | null> {
  const [row] = await db
    .select({
      id: bookingEntry.id,
      eventId: bookingEntry.eventId,
      accountId: bookingEntry.accountId,
      status: bookingEntry.status,
      contactEmail: bookingEntry.contactEmail,
    })
    .from(bookingEntry)
    .where(eq(bookingEntry.id, entryId))
    .limit(1);
  return row ?? null;
}

/**
 * 個人の設定があるか（退会の確かめ）。
 * @param db DB
 * @param accountId アカウント
 * @returns あれば true
 */
export async function hasPersonalChannel(db: Executor, accountId: string): Promise<boolean> {
  return (await findChannelByHolder(db, { kind: "personal", accountId })) !== null;
}
