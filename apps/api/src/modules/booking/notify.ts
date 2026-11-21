// 予約の知らせを送る業務の関数（booking-002。AD-24・PRD FR-B80〜FR-B87）。何をいつ誰に送るかは booking が持ち、送る道具
// （守りを通す）は platform/notify。送り先は LINE（交流会に当てはまる公式アカウントと紐づいている）→ メール（本人が入れた
// アドレス）→ なし の順（research R5・R6）。守りで止めたときと LINE が送れなかったときは、ほかの手段を試さない。
// 記録（booking_notice）とログには、本文・宛先・トークンを出さない。この版では、次の仕様（自前の申込み・キャンセル待ち）が呼ぶ。
import type { NoticeMethod, NoticeResult } from "@workspace/contracts/booking";
import type { TestMessageResult } from "@workspace/contracts/booking";
import { BOOKING_ERRORS } from "@workspace/contracts/booking";
import { AppError } from "../../kernel/errors.ts";
import type { DeliveryStatus } from "../../kernel/notifier.ts";
import {
  findEventOrganizationId,
  findEventOwnerAccountId,
  getEventSummary,
} from "../event/index.ts";
import {
  noticeEmailText,
  noticeSubject,
  noticeText,
  senderName,
  testMessageText,
} from "./notice-templates.ts";
import type { EntryNoticeKind, NoticeContext } from "./notice-templates.ts";
import {
  findChannelByHolder,
  findContactEmail,
  findEntryForNotice,
  findLinkedLineUser,
  insertNotice,
} from "./notify-repository.ts";
import type { ChannelRecord, NotifyHolderRef } from "./notify-repository.ts";
import { holderNameOf, notifierOf, openLine } from "./notify-settings.ts";
import type { NotifyDeps } from "./notify-settings.ts";

/** sendNotice に渡すもの。 */
export type SendNoticeInput = {
  /** 相手の申込み */
  entryId: string;
  /** 種類 */
  kind: EntryNoticeKind;
  /** 打診の返事の期限 */
  deadline?: Date;
  /** キャンセル待ちの何番目か */
  waitlistPosition?: number;
  /** 前の日時と場所（変更の知らせ） */
  previous?: NoticeContext["previous"];
  /** リンク（取り消し・返事・カレンダー） */
  links?: NoticeContext["links"];
};

/** sendNotice の結果。 */
export type SendNoticeResult = { method: NoticeMethod; result: NoticeResult };

/**
 * 送る道具の結果を、記録の結果にする。
 * @param status 送る道具の結果
 * @returns 記録の結果
 */
function toResult(status: DeliveryStatus): NoticeResult {
  return status;
}

/**
 * 交流会に当てはまる公式アカウントの設定の持ち主（組織に入れていれば組織、なければ持ち主の個人。research R5）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 持ち主（持ち主のない交流会は null）
 */
export async function eventNotifyHolder(
  db: NotifyDeps["db"],
  eventId: string,
): Promise<NotifyHolderRef | null> {
  const organizationId = await findEventOrganizationId(db, eventId);
  if (organizationId) return { kind: "organization", organizationId };
  const ownerAccountId = await findEventOwnerAccountId(db, eventId);
  return ownerAccountId ? { kind: "personal", accountId: ownerAccountId } : null;
}

/**
 * 申込みの相手に、予約の知らせを1つ送り、記録する。
 * @param deps 道具（DB・送る道具・秘密の箱・ログ）
 * @param input 申込み・種類・期限など
 * @returns 手段と結果
 * @throws {AppError} 申込み・交流会がないとき（404 BOOKING_ENTRY_NOT_FOUND）
 */
export async function sendNotice(
  deps: NotifyDeps,
  input: SendNoticeInput,
): Promise<SendNoticeResult> {
  const { db } = deps;
  const entry = await findEntryForNotice(db, input.entryId);
  const event = entry ? await getEventSummary(db, deps.config, entry.eventId) : null;
  if (!entry || !event) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  const holder = await eventNotifyHolder(db, entry.eventId);
  const channel: ChannelRecord | null = holder ? await findChannelByHolder(db, holder) : null;
  const holderName = holder ? await holderNameOf(db, holder) : "";
  const context: NoticeContext = {
    holderName,
    eventName: event.name,
    startsAt: new Date(event.startsAt),
    venue: event.venue,
    entryStatus: entry.status,
    ...(input.deadline ? { deadline: input.deadline } : {}),
    ...(input.waitlistPosition ? { waitlistPosition: input.waitlistPosition } : {}),
    ...(input.previous ? { previous: input.previous } : {}),
    ...(input.links ? { links: input.links } : {}),
  };
  const notifier = notifierOf(deps);
  /**
   * 記録して返す。
   * @param method 手段
   * @param result 結果
   * @returns 手段と結果
   */
  const record = async (method: NoticeMethod, result: NoticeResult): Promise<SendNoticeResult> => {
    await insertNotice(db, {
      entryId: entry.id,
      channelId: channel?.id ?? null,
      kind: input.kind,
      method,
      result,
    });
    deps.logger.info({ entryId: entry.id, kind: input.kind, method, result }, "予約の知らせ");
    return { method, result };
  };

  // 1. LINE：申込みのアカウントが、当てはまる公式アカウントと紐づいている
  if (entry.accountId && channel && channel.lineChannelId !== null) {
    const lineUserId = await findLinkedLineUser(db, channel.id, entry.accountId);
    if (lineUserId) {
      const opened = await openLine(deps.secretBox, channel);
      if (!opened) return record("line", "failed");
      const { status } = await notifier.pushLine({
        accessToken: opened.accessToken,
        to: lineUserId,
        text: noticeText(input.kind, context),
      });
      return record("line", toResult(status));
    }
  }
  // 2. メール：本人が入れたアドレス（主催者には見せない）
  const email = entry.accountId ? await findContactEmail(db, entry.accountId) : null;
  if (email) {
    const replyTo = channel?.replyToEmail ?? null;
    const { status } = await notifier.sendEmail({
      to: email,
      fromName: senderName(holderName),
      replyTo,
      subject: noticeSubject(input.kind, event.name),
      text: noticeEmailText(input.kind, context, replyTo !== null),
    });
    return record("email", toResult(status));
  }
  // 3. どちらもない
  return record("none", "no_destination");
}

/** 確かめのメッセージの結果の文。 */
const TEST_MESSAGES: Record<TestMessageResult["result"], string> = {
  sent: "確かめのメッセージを送りました。LINE を開いて、届いたかを確かめてください。",
  off: "いまは知らせを止めているため、送りませんでした（運営の設定）。",
  not_allowed:
    "許可リストにないため、送りませんでした。運営に、下の ID を許可リスト（NOTIFY_ALLOWLIST）に足してもらってください。",
  failed:
    "送れませんでした。アクセストークンが正しいか、公式アカウントをブロックしていないかを確かめてください。",
  unavailable: "送れませんでした（準備ができていません）。運営に知らせてください。",
  no_destination:
    "まだ紐づいていません。公式アカウントを友だち追加し、届いたリンクを開いて紐づけてください。",
  not_linked:
    "まだ紐づいていません。公式アカウントを友だち追加し、届いたリンクを開いて紐づけてください。",
};

/**
 * 設定の画面の「自分に確かめのメッセージを送る」（今の利用者が紐づいていれば、守りを通して本人にだけ送る）。
 * @param deps 道具
 * @param holder 持ち主
 * @param accountId 今の利用者
 * @returns 結果と画面の文
 * @throws {AppError} LINE の値がない（409）・秘密の箱がない（503）とき
 */
export async function sendTestMessage(
  deps: NotifyDeps,
  holder: NotifyHolderRef,
  accountId: string,
): Promise<TestMessageResult> {
  const { db } = deps;
  if (!deps.secretBox) throw new AppError(BOOKING_ERRORS.NOTIFY_UNAVAILABLE);
  const channel = await findChannelByHolder(db, holder);
  if (!channel || channel.lineChannelId === null) throw new AppError(BOOKING_ERRORS.LINE_NOT_SET);
  const lineUserId = await findLinkedLineUser(db, channel.id, accountId);
  if (!lineUserId) return { result: "not_linked", message: TEST_MESSAGES.not_linked };
  const opened = await openLine(deps.secretBox, channel);
  let result: NoticeResult = "failed";
  if (opened) {
    const { status } = await notifierOf(deps).pushLine({
      accessToken: opened.accessToken,
      to: lineUserId,
      text: testMessageText(await holderNameOf(db, holder)),
    });
    result = toResult(status);
  }
  await insertNotice(db, {
    entryId: null,
    channelId: channel.id,
    kind: "test",
    method: "line",
    result,
  });
  return {
    result,
    // 許可リストにないときだけ、本人の ID を本人に返す（運営が許可リストに足すため。research R4）
    ...(result === "not_allowed" ? { lineUserId } : {}),
    message: TEST_MESSAGES[result],
  };
}
