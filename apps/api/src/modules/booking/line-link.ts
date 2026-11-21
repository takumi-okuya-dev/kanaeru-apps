// 紐づけの札と紐づけ（booking-002 research R3・R16。AD-24）。札は32バイトの乱数を base64url にしたもので、DB には SHA-256 だけを持つ。
// 7日・1回だけ。同じ LINE の友だちの使っていない札は、新しい札を作るとき・ブロックのときに消す。札・LINE のユーザー ID はログに出さない。
// 送り先は Webhook の公式アカウントから見える ID だけ（LINE ログインの sub は使わない）。
// リンクを他人に渡されたときの守り（research S7）：札のページでその札の LINE の友だちの表示名を見せ、「自分で受け取ったリンクで
// なければ押さない」と書く。紐づけたら、その LINE に「◯◯さんのアカウントと紐づきました。心当たりがなければブロック」を送る（守りを通す）。
import { createHash, randomBytes } from "node:crypto";
import { BOOKING_ERRORS, LINE_LINK_TTL_DAYS } from "@workspace/contracts/booking";
import type { LineLinkPreview } from "@workspace/contracts/booking";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { findDisplayNames } from "../account/index.ts";
import { linkedNoticeText } from "./notice-templates.ts";
import {
  deleteUnusedTokens,
  findChannelById,
  findLinkedLineUser,
  findTokenByHash,
  insertToken,
  markTokenUsed,
  replaceLink,
} from "./notify-repository.ts";
import type { ChannelRecord } from "./notify-repository.ts";
import { holderNameOf, holderOfChannel, notifierOf, openLine } from "./notify-settings.ts";
import type { NotifyDeps } from "./notify-settings.ts";

/** 札の長さ（バイト）。 */
const TOKEN_BYTES = 32;

/** 札の形（base64url）。 */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * 札の SHA-256（16進）。
 * @param token 札
 * @returns ハッシュ
 */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
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
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
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
 * 札の LINE の友だちの表示名（使える札のときだけ。読めなければ null）。
 * @param deps 道具
 * @param channel 設定の行
 * @param lineUserId 札の LINE のユーザー ID
 * @returns 表示名
 */
async function lineDisplayNameOf(
  deps: NotifyDeps,
  channel: ChannelRecord,
  lineUserId: string,
): Promise<string | null> {
  const opened = await openLine(deps.secretBox, channel);
  if (!opened) return null;
  const profile = await notifierOf(deps).getLineProfile(opened.accessToken, lineUserId);
  return profile.ok ? profile.displayName : null;
}

/**
 * 札の中身を読む（使える・使った・期限切れ。使える札なら、その札の LINE の友だちの表示名も）。
 * @param deps 道具
 * @param token 札
 * @param accountId 今の利用者
 * @param now 今の時刻
 * @returns 中身
 * @throws {AppError} 知らない札・設定が消えたとき（404 BOOKING_LINK_INVALID）
 */
export async function previewLinkToken(
  deps: NotifyDeps,
  token: string,
  accountId: string,
  now: Date,
): Promise<LineLinkPreview> {
  const { db } = deps;
  if (!TOKEN_FORMAT.test(token)) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  const row = await findTokenByHash(db, hashLinkToken(token));
  const channel = row ? await findChannelById(db, row.channelId) : null;
  if (!row || !channel || channel.lineChannelId === null) {
    throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  }
  const linkedToMe = (await findLinkedLineUser(db, channel.id, accountId)) === row.lineUserId;
  const state = row.usedAt ? "used" : row.expiresAt <= now ? "expired" : "valid";
  return {
    holderName: await holderNameOf(db, holderOfChannel(channel)),
    state,
    linkedToMe,
    expiresAt: row.expiresAt.toISOString(),
    lineDisplayName:
      state === "valid" ? await lineDisplayNameOf(deps, channel, row.lineUserId) : null,
  };
}

/**
 * 札を使って紐づける（同じ札を2回は使えない）。紐づけたら、その LINE に紐づけたことを知らせる（守りを通す。送れなくても紐づけは残る）。
 * @param deps 道具
 * @param token 札
 * @param accountId 今の利用者
 * @param now 今の時刻
 * @returns 公式アカウントの持ち主の名前
 * @throws {AppError} 知らない（404）・期限切れ（410）・使った（409）とき
 */
export async function consumeLinkToken(
  deps: NotifyDeps,
  token: string,
  accountId: string,
  now: Date,
): Promise<string> {
  const { db } = deps;
  if (!TOKEN_FORMAT.test(token)) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
  const linked = await db.transaction(async (tx) => {
    const row = await findTokenByHash(tx, hashLinkToken(token), true);
    if (!row) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
    const channel = await findChannelById(tx, row.channelId);
    if (!channel || channel.lineChannelId === null) throw new AppError(BOOKING_ERRORS.LINK_INVALID);
    if (row.usedAt) throw new AppError(BOOKING_ERRORS.LINK_USED);
    if (row.expiresAt <= now) throw new AppError(BOOKING_ERRORS.LINK_EXPIRED);
    await replaceLink(tx, { channelId: channel.id, lineUserId: row.lineUserId, accountId });
    await markTokenUsed(tx, row.id, accountId, now);
    return { channelId: channel.id, lineUserId: row.lineUserId };
  });
  const channel = await findChannelById(db, linked.channelId);
  if (!channel) return "";
  const holderName = await holderNameOf(db, holderOfChannel(channel));
  await sendLinkedNotice(deps, channel, linked.lineUserId, holderName, accountId);
  return holderName;
}

/**
 * 紐づけたその LINE に、紐づけたことを知らせる（守りを通す。送れなくても紐づけは残す。宛先・本文はログに出さない）。
 * @param deps 道具
 * @param channel 設定の行
 * @param lineUserId 紐づけた LINE のユーザー ID
 * @param holderName 公式アカウントの持ち主の名前
 * @param accountId 紐づけた kanaeru のアカウント
 */
async function sendLinkedNotice(
  deps: NotifyDeps,
  channel: ChannelRecord,
  lineUserId: string,
  holderName: string,
  accountId: string,
): Promise<void> {
  try {
    const opened = await openLine(deps.secretBox, channel);
    if (!opened) return;
    const accountName = (await findDisplayNames(deps.db, [accountId])).get(accountId) ?? "";
    const { status } = await notifierOf(deps).pushLine({
      accessToken: opened.accessToken,
      to: lineUserId,
      text: linkedNoticeText(holderName, accountName),
    });
    deps.logger.info({ channelId: channel.id, result: status }, "紐づけたことの知らせ");
  } catch (error) {
    deps.logger.warn(
      { channelId: channel.id, errorName: error instanceof Error ? error.name : "unknown" },
      "紐づけたことの知らせを送れませんでした",
    );
  }
}
