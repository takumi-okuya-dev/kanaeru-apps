// 紐づけの札と紐づけ（booking-002 research R3・R16。AD-24）。札は32バイトの乱数を base64url にしたもので、DB には SHA-256 だけを持つ。
// 7日・1回だけ。同じ LINE の友だちの使っていない札は、新しい札を作るとき・ブロックのときに消す。札・LINE のユーザー ID はログに出さない。
// 送り先は Webhook の公式アカウントから見える ID だけ（LINE ログインの sub は使わない）。
import { BOOKING_ERRORS, LINE_LINK_TTL_DAYS } from "@workspace/contracts/booking";
import type { LineLinkPreview } from "@workspace/contracts/booking";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import {
  deleteUnusedTokens,
  findChannelById,
  findLinkedLineUser,
  findTokenByHash,
  insertToken,
  markTokenUsed,
  replaceLink,
} from "./notify-repository.ts";
import { holderNameOf, holderOfChannel } from "./notify-settings.ts";
import { TOKEN_FORMAT, createToken, hashToken } from "./tokens.ts";

/**
 * 札の SHA-256（16進。札の作り方は tokens.ts で booking-003 と共に使う）。
 * @param token 札
 * @returns ハッシュ
 */
export function hashLinkToken(token: string): string {
  return hashToken(token);
}

/**
 * 友だち追加した人の札を作る（前の使っていない札は消す）。
 * @param db DB
 * @param channelId 設定の行の ID
 * @param lineUserId 公式アカウントから見える LINE のユーザー ID
 * @param now 今の時刻
 * @returns 札（あいさつのリンクに入れる。DB には持たない）
 */
export async function issueLinkToken(
  db: Executor,
  channelId: string,
  lineUserId: string,
  now: Date,
): Promise<string> {
  const token = createToken();
  await deleteUnusedTokens(db, channelId, lineUserId);
  await insertToken(db, {
    channelId,
    lineUserId,
    tokenHash: hashLinkToken(token),
    expiresAt: new Date(now.getTime() + LINE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

/**
 * 札の中身を読む（使える・使った・期限切れ）。
 * @param db DB
 * @param token 札
 * @param accountId 今の利用者
 * @param now 今の時刻
 * @returns 中身
 * @throws {AppError} 知らない札・設定が消えたとき（404 BOOKING_LINK_INVALID）
 */
export async function previewLinkToken(
  db: Executor,
  token: string,
  accountId: string,
  now: Date,
): Promise<LineLinkPreview> {
  if (!TOKEN_FORMAT.test(token)) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  const row = await findTokenByHash(db, hashLinkToken(token));
  const channel = row ? await findChannelById(db, row.channelId) : null;
  if (!row || !channel || channel.lineChannelId === null) {
    throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  }
  const linkedToMe = (await findLinkedLineUser(db, channel.id, accountId)) === row.lineUserId;
  return {
    holderName: await holderNameOf(db, holderOfChannel(channel)),
    state: row.usedAt ? "used" : row.expiresAt <= now ? "expired" : "valid",
    linkedToMe,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * 札を使って紐づける（同じ札を2回は使えない）。
 * @param db DB
 * @param token 札
 * @param accountId 今の利用者
 * @param now 今の時刻
 * @returns 公式アカウントの持ち主の名前
 * @throws {AppError} 知らない（404）・期限切れ（410）・使った（409）とき
 */
export async function consumeLinkToken(
  db: Db,
  token: string,
  accountId: string,
  now: Date,
): Promise<string> {
  if (!TOKEN_FORMAT.test(token)) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  const channelId = await db.transaction(async (tx) => {
    const row = await findTokenByHash(tx, hashLinkToken(token), true);
    if (!row) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
    const channel = await findChannelById(tx, row.channelId);
    if (!channel || channel.lineChannelId === null) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
    if (row.usedAt) throw new AppError(BOOKING_ERRORS.LINK_USED);
    if (row.expiresAt <= now) throw new AppError(BOOKING_ERRORS.LINK_EXPIRED);
    await replaceLink(tx, { channelId: channel.id, lineUserId: row.lineUserId, accountId });
    await markTokenUsed(tx, row.id, accountId, now);
    return channel.id;
  });
  const channel = await findChannelById(db, channelId);
  return channel ? holderNameOf(db, holderOfChannel(channel)) : "";
}
