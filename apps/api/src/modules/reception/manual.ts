// 手でのチェックインを作る（主催者・受付係の窓口と、booking の飛び入り・名簿から選んで手でチェックインが使う。booking-001 research R9）。
// 金額はその時の交流会の参加費と選んだ割引から決める（AD-6。amount.ts・discount.ts）。booking は自分のトランザクションの tx を渡し、
// 同じトランザクションで名簿の行を書く（reception は booking を知らない。AD-23）。
import { EVENT_ERRORS } from "@workspace/contracts/event";
import type { CheckinInput } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { getEventSummary } from "../event/index.ts";
import { decideAmount } from "./amount.ts";
import { discountForNewCheckin } from "./discount.ts";
import { insertCheckin } from "./repository.ts";
import type { CheckinRecord } from "./repository.ts";

/** 手でのチェックインを作るときの値。 */
export type ManualCheckinRequest = {
  /** 交流会の ID */
  eventId: string;
  /** 入れた人（主催者か受付係の account の ID） */
  enteredBy: string;
  /** 入力（名前・3つの選択肢・割引・紹介者） */
  input: CheckinInput;
};

/**
 * 手でのチェックインを作る（ほかの領域も index.ts から使う）。
 * @param db DB（呼ぶ側のトランザクションを渡してよい）
 * @param config 領域の設定（参加費を読むため）
 * @param request 交流会・入れた人・入力
 * @returns 作ったチェックイン
 * @throws {AppError} 交流会がないとき（event の NOT_FOUND）・選べない割引のとき（DISCOUNT_UNAVAILABLE）
 */
export async function createManualCheckin(
  db: Executor,
  config: Pick<DomainConfig, "openChatUrl">,
  request: ManualCheckinRequest,
): Promise<CheckinRecord> {
  const { eventId, enteredBy, input } = request;
  const summary = await getEventSummary(db, config, eventId);
  if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  const discount = await discountForNewCheckin(db, eventId, input);
  return insertCheckin(db, {
    eventId,
    enteredBy,
    name: input.name,
    applicationSource: input.applicationSource,
    referral: input.referral,
    paymentMethod: input.paymentMethod,
    ...discount,
    amount: decideAmount(input.paymentMethod, summary.fee, discount.discountAmount),
  });
}
